/**
 * @module channel/feishu/sender
 * @description 飞书 API 消息发送与卡片构建模块
 *
 * 负责所有飞书 API 消息发送操作：
 * - 获取 tenant_access_token（带缓存）
 * - 发送文本 / 卡片 / 回复卡片消息
 * - 构建进度卡片、超时卡片
 * - Markdown 长文本分段
 * - GFM / box-drawing 表格解析并转为飞书原生 table 元素
 */

import https from 'node:https';
import logger from '../../middleware/logger.js';
import { FEISHU_TABLE_LIMIT } from '../../../shared/constants.js';

// ── 类型定义 ────────────────────────────────────────────────────────────

/** 飞书 API 返回的 token 缓存条目 */
interface TokenCache {
  /** tenant_access_token */
  token: string;
  /** 过期时间戳（ms） */
  expires: number;
}

/** 飞书 API 通用响应体 */
interface FeishuApiResponse {
  /** 返回码，0 表示成功 */
  code: number;
  /** 描述信息 */
  msg: string;
  /** 响应数据 */
  data?: unknown;
  /** tenant_access_token（仅 token 接口） */
  tenant_access_token?: string;
  /** 有效期秒数（仅 token 接口） */
  expire?: number;
}

/** 飞书原生 table 元素列定义 */
interface TableColumn {
  /** 列标识（如 c0, c1） */
  name: string;
  /** 列显示名 */
  display_name: string;
  /** 列数据类型 */
  data_type: 'text';
}

/** 飞书原生 table 元素 */
interface TableElement {
  /** 元素标签 */
  tag: 'table';
  /** 列定义 */
  columns: TableColumn[];
  /** 数据行 */
  rows: Record<string, string>[];
  /** 行高 */
  row_height: 'middle';
}

/** 飞书卡片 markdown 元素 */
interface MarkdownElement {
  /** 元素标签 */
  tag: 'markdown';
  /** Markdown 内容 */
  content: string;
}

/** 飞书卡片分隔线元素 */
interface HrElement {
  /** 元素标签 */
  tag: 'hr';
}

/** 飞书卡片注脚元素 */
interface NoteElement {
  /** 元素标签 */
  tag: 'note';
  /** 子元素列表 */
  elements: Array<{ tag: 'plain_text'; content: string }>;
}

/** 飞书卡片标题 */
interface CardTitle {
  /** 标签 */
  tag: 'plain_text';
  /** 文本内容 */
  content: string;
}

/** 飞书卡片头部 */
interface CardHeader {
  /** 标题 */
  title: CardTitle;
  /** 颜色模板 */
  template: string;
}

/** 按钮元素文本 */
interface ButtonText {
  tag: 'plain_text';
  content: string;
}

/** 卡片按钮元素 */
interface ButtonElement {
  tag: 'button';
  text: ButtonText;
  /** 按钮主题：primary / default / danger */
  type: 'primary' | 'default' | 'danger';
  /** 点击时回传给服务端的业务数据 */
  value: Record<string, string | number>;
}

/** 一行按钮组（actions 元素） */
interface ActionElement {
  tag: 'action';
  actions: ButtonElement[];
}

/** 卡片元素联合类型（前向声明，供 CollapsiblePanelElement 使用） */
type CardElement = MarkdownElement | HrElement | NoteElement | TableElement | CollapsiblePanelElement;

/** 可折叠面板元素 */
interface CollapsiblePanelElement {
  tag: 'collapsible_panel';
  expanded: boolean;
  header: { title: { tag: 'plain_text'; content: string } };
  elements: CardElement[];
}

/** 飞书交互式卡片 */
interface InteractiveCard {
  /** 卡片头部 */
  header: CardHeader;
  /** 卡片元素列表 */
  elements: Array<MarkdownElement | HrElement | NoteElement | TableElement | ActionElement | CollapsiblePanelElement>;
}

/** 回复卡片选项 */
export interface ReplyCardOptions {
  /** 进程名 */
  processName: string;
  /** 用户问题 */
  userQuestion: string;
  /** 回复正文 */
  reply: string;
  /** 耗时（秒） */
  elapsed: number;
  /** 是否超时兜底 */
  isTimeout: boolean;
  /** 工具调用统计，如 { Bash: 2, Edit: 1 } */
  toolCount?: Record<string, number>;
  /** cc 自报耗时（秒） */
  timing?: number;
  /** 估算费用（美元） */
  costUsdEstimated?: number;
}

// ── Token 缓存 ──────────────────────────────────────────────────────────

/** 每个 app_id 独立缓存 token */
const tokenCaches: Record<string, TokenCache> = {};

/**
 * 获取飞书 tenant_access_token
 *
 * 优先使用缓存（提前 60 秒过期避免边界情况），缓存未命中或已过期时
 * 通过 HTTPS 请求飞书内部 API 获取新 token。
 *
 * @param appId     - 飞书应用 App ID
 * @param appSecret - 飞书应用 App Secret
 * @returns tenant_access_token 字符串
 * @throws Token 获取失败时 reject
 */
export function getAccessToken(appId: string, appSecret: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const cache = tokenCaches[appId];
    if (cache && cache.token && cache.expires > Date.now()) {
      return resolve(cache.token);
    }

    const body = JSON.stringify({ app_id: appId, app_secret: appSecret });

    const req = https.request(
      {
        hostname: 'open.feishu.cn',
        path: '/open-apis/auth/v3/tenant_access_token/internal',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer | string) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as FeishuApiResponse;
            if (json.code === 0 && json.tenant_access_token) {
              tokenCaches[appId] = {
                token: json.tenant_access_token,
                expires: Date.now() + ((json.expire ?? 7200) - 60) * 1000,
              };
              resolve(tokenCaches[appId].token);
            } else {
              reject(new Error(`Token 获取失败: ${json.msg}`));
            }
          } catch (e) {
            reject(e as Error);
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ── 消息发送 ────────────────────────────────────────────────────────────

/**
 * 发送消息到飞书指定目标
 *
 * 底层通用发送函数，支持 text / interactive / image 等所有消息类型。
 * 飞书 API 返回非零 code 时 reject 并附带错误信息。
 *
 * @param appId         - 飞书应用 App ID
 * @param appSecret     - 飞书应用 App Secret
 * @param receiveIdType - 接收者 ID 类型（'chat_id' / 'open_id'）
 * @param receiveId     - 接收者 ID
 * @param msgType       - 消息类型（'text' / 'interactive' / ...）
 * @param content       - 消息内容对象（会被 JSON.stringify 序列化）
 * @returns 飞书 API 响应 JSON
 * @throws 飞书 API 错误或网络异常时 reject
 */
export function sendMessage(
  appId: string,
  appSecret: string,
  receiveIdType: string,
  receiveId: string,
  msgType: string,
  content: unknown,
): Promise<FeishuApiResponse> {
  return new Promise((resolve, reject) => {
    getAccessToken(appId, appSecret)
      .then((token) => {
        const body = JSON.stringify({
          receive_id: receiveId,
          msg_type: msgType,
          content: JSON.stringify(content),
        });

        const req = https.request(
          {
            hostname: 'open.feishu.cn',
            path: `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          },
          (res) => {
            let data = '';
            res.on('data', (chunk: Buffer | string) => { data += chunk; });
            res.on('end', () => {
              try {
                const json = JSON.parse(data) as FeishuApiResponse;
                if (json.code !== 0) {
                  logger.log(
                    'error',
                    `[sender] 飞书 API 错误 code=${json.code} msg=${json.msg}`,
                    JSON.stringify(json).slice(0, 300),
                  );
                  reject(new Error(`飞书 API 错误 ${json.code}: ${json.msg}`));
                } else {
                  resolve(json);
                }
              } catch (e) {
                logger.log('error', '[sender] 响应解析失败', data.slice(0, 200));
                reject(e as Error);
              }
            });
          },
        );
        req.on('error', reject);
        req.write(body);
        req.end();
      })
      .catch(reject);
  });
}

/**
 * 发送文本消息
 *
 * @param appId         - 飞书应用 App ID
 * @param appSecret     - 飞书应用 App Secret
 * @param receiveIdType - 接收者 ID 类型
 * @param receiveId     - 接收者 ID
 * @param text          - 纯文本内容
 * @returns 飞书 API 响应 JSON
 */
export function sendText(
  appId: string,
  appSecret: string,
  receiveIdType: string,
  receiveId: string,
  text: string,
): Promise<FeishuApiResponse> {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'text', { text });
}

/**
 * 发送交互式卡片消息
 *
 * @param appId         - 飞书应用 App ID
 * @param appSecret     - 飞书应用 App Secret
 * @param receiveIdType - 接收者 ID 类型
 * @param receiveId     - 接收者 ID
 * @param card          - 卡片内容对象
 * @returns 飞书 API 响应 JSON
 */
export function sendCard(
  appId: string,
  appSecret: string,
  receiveIdType: string,
  receiveId: string,
  card: InteractiveCard,
): Promise<FeishuApiResponse> {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'interactive', card);
}

// ── Markdown 分段 ────────────────────────────────────────────────────────

/**
 * 超长 Markdown 文本分段
 *
 * 飞书单个 markdown element 约 4000 字符限制，超出需分段发送。
 * 优先在换行符处截断，保证段落完整性；若前半段无换行符则硬切。
 *
 * @param md      - 原始 Markdown 文本
 * @param maxLen  - 每段最大长度，默认 4000
 * @returns 分段后的字符串数组
 */
export function chunkMarkdown(md: string, maxLen: number = 4000): string[] {
  if (md.length <= maxLen) return [md];
  const chunks: string[] = [];
  let rest = md;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// ── 表格解析 ────────────────────────────────────────────────────────────

/**
 * 解析 GFM 表格行为列数组
 *
 * 处理 `| col | col |` 格式的行，去除首尾 `|` 后按 `|` 分割。
 *
 * @param line - GFM 表格行文本
 * @returns 去除首尾空白后的各列字符串数组
 */
function parseGfmRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * 解析 GFM 表格（| col | col | + | --- | --- |）为飞书原生 table 元素
 *
 * 第一行为表头，第二行为分隔行（跳过），其余为数据行。
 * 空表或无数据行返回 null。
 *
 * @param tblLines - GFM 表格行数组
 * @returns 飞书原生 TableElement，解析失败返回 null
 */
export function parseGfmTable(tblLines: string[]): TableElement | null {
  const headers = parseGfmRow(tblLines[0]);
  const dataRows = tblLines.slice(2).map(parseGfmRow); // 跳过 | --- | 分隔行

  if (!headers.length) return null;

  const columns: TableColumn[] = headers.map((h, idx) => ({
    name: `c${idx}`,
    display_name: h || `列${idx + 1}`,
    data_type: 'text' as const,
  }));

  const rows = dataRows
    .filter((r) => r.some((c) => c))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((_, idx) => {
        obj[`c${idx}`] = row[idx] || '';
      });
      return obj;
    });

  if (!rows.length) return null;
  return { tag: 'table', columns, rows, row_height: 'middle' };
}

/**
 * 解析 box-drawing 表格为飞书原生 table 元素
 *
 * box-drawing 表格使用 ┌─┐/├─┤/└─┘ 等字符绘制边框，│ 分隔列。
 * 仅提取以 │ 开头的数据行，跳过边框绘制行。
 *
 * @param tblLines - box-drawing 表格行数组
 * @returns 飞书原生 TableElement，解析失败返回 null
 */
export function parseBoxDrawingTable(tblLines: string[]): TableElement | null {
  // 只取数据行（以 │ 开头且不是分隔行 ┌├└）
  const dataLines = tblLines.filter((l) => {
    const t = l.trim();
    return t.startsWith('│') && !/^[┌├└]/.test(t);
  });

  if (!dataLines.length) return null;

  const parseRow = (line: string): string[] =>
    line.split('│').slice(1, -1).map((cell) => cell.trim());

  const allRows = dataLines.map(parseRow);
  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  if (!headers || !headers.length) return null;

  const columns: TableColumn[] = headers.map((h, idx) => ({
    name: `c${idx}`,
    display_name: h || `列${idx + 1}`,
    data_type: 'text' as const,
  }));

  const rows = dataRows
    .filter((r) => r.some((c) => c))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((_, idx) => {
        obj[`c${idx}`] = row[idx] || '';
      });
      return obj;
    });

  if (!rows.length) return null;
  return { tag: 'table', columns, rows, row_height: 'middle' };
}

// ── Markdown → 飞书卡片元素 ────────────────────────────────────────────

/**
 * 将 Markdown 文本转换为飞书卡片 elements 数组
 *
 * 转换规则：
 * - GFM / box-drawing 表格 → 飞书原生 `{ tag: 'table' }` 元素
 *   （每张卡片最多 FEISHU_TABLE_LIMIT 个，超出转代码块）
 * - 其余文本 → `{ tag: 'markdown' }` 元素（超长自动分段）
 * - 已有代码块（```）内的内容不做表格检测
 *
 * @param md - 原始 Markdown 文本
 * @returns 飞书卡片元素数组
 */
const COLLAPSE_THRESHOLD = 1500;

export function replyToCardElements(md: string): CardElement[] {
  if (!md) return [];
  const lines = md.split('\n');
  const elements: CardElement[] = [];
  let textBuf: string[] = [];
  let i = 0;
  let inCodeBlock = false;
  let tableCount = 0;

  /** 将文本缓冲区中的内容写入 elements（超长自动分段） */
  function flushText(): void {
    const text = textBuf.join('\n').trim();
    textBuf = [];
    if (!text) return;
    chunkMarkdown(text, 4000).forEach((c) =>
      elements.push({ tag: 'markdown', content: c }),
    );
  }

  /**
   * 推入表格元素
   *
   * 若当前表格数量未达上限且解析成功，使用原生 table 元素；
   * 否则降级为代码块以保持等宽对齐。
   *
   * @param tblLines - 原始表格行数组
   * @param el       - 解析后的 table 元素，null 表示解析失败
   */
  function pushTable(tblLines: string[], el: TableElement | null): void {
    if (el && tableCount < FEISHU_TABLE_LIMIT) {
      elements.push(el);
      tableCount++;
    } else {
      // 超出上限或解析失败：用代码块保持等宽对齐
      elements.push({
        tag: 'markdown',
        content: '```\n' + tblLines.join('\n') + '\n```',
      });
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    // 跟踪已有代码块，不对代码块内容做表格检测
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      textBuf.push(line);
      i++;
      continue;
    }

    if (!inCodeBlock) {
      // GFM 表格：当前行含 |，下一行是 | --- | --- |
      if (
        /\|/.test(line) &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[i + 1])
      ) {
        flushText();
        const tbl = [line];
        i++;
        tbl.push(lines[i]);
        i++;
        while (i < lines.length && /\|/.test(lines[i])) {
          tbl.push(lines[i]);
          i++;
        }
        pushTable(tbl, parseGfmTable(tbl));
        continue;
      }

      // box-drawing 表格：含角/交叉字符，或同行 >= 2 个 │
      const isBox =
        /[┌┐└┘├┤┬┴┼╪╫╬]/.test(line) ||
        (line.match(/│/g) || []).length >= 2;
      if (isBox) {
        flushText();
        const tbl = [line];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (
            /[┌┐└┘├┤┬┴┼╪╫╬]/.test(next) ||
            (next.match(/│/g) || []).length >= 2
          ) {
            tbl.push(next);
            i++;
          } else {
            break;
          }
        }
        pushTable(tbl, parseBoxDrawingTable(tbl));
        continue;
      }
    }

    textBuf.push(line);
    i++;
  }

  flushText();

  // 长回复折叠：超过阈值时，前部分保持可见，后半放入 collapsible_panel
  if (elements.length > 1) {
    let totalChars = 0;
    for (const el of elements) {
      if (el.tag === 'markdown') totalChars += (el as MarkdownElement).content.length;
      else if (el.tag === 'table') totalChars += JSON.stringify((el as TableElement).rows).length;
    }
    if (totalChars > COLLAPSE_THRESHOLD) {
      // 找到第一个 hr（通常在问题信息和回复正文之间），其后的元素为可折叠内容
      let hrIdx = elements.findIndex((el) => el.tag === 'hr');
      if (hrIdx < 0) hrIdx = 0;

      // 计算可见部分字符数，保持前 COLLAPSE_THRESHOLD 字符可见
      let visibleCount = 0;
      let splitIdx = elements.length;
      for (let j = hrIdx + 1; j < elements.length; j++) {
        const el = elements[j];
        let charCount = 0;
        if (el.tag === 'markdown') charCount = (el as MarkdownElement).content.length;
        else if (el.tag === 'table') charCount = JSON.stringify((el as TableElement).rows).length;
        else if (el.tag === 'hr') charCount = 0;
        else charCount = 50;

        if (visibleCount + charCount > COLLAPSE_THRESHOLD && j > hrIdx + 1) {
          splitIdx = j;
          break;
        }
        visibleCount += charCount;
      }

      if (splitIdx < elements.length) {
        // 去掉末尾的 hr + note，它们属于底部区域
        let lastHrIdx = -1;
        for (let j = elements.length - 1; j >= 0; j--) {
          if (elements[j].tag === 'hr') { lastHrIdx = j; break; }
        }

        const visibleElements = elements.slice(0, splitIdx);
        // 折叠区域：从 splitIdx 到最后的 hr 之前
        const collapsedElements = lastHrIdx > splitIdx
          ? elements.slice(splitIdx, lastHrIdx)
          : elements.slice(splitIdx);

        if (collapsedElements.length > 0) {
          const lineCount = collapsedElements.reduce(
            (acc, el) => acc + (el.tag === 'markdown' ? (el as MarkdownElement).content.split('\n').length : 1), 0,
          );
          visibleElements.push({
            tag: 'collapsible_panel',
            expanded: false,
            header: { title: { tag: 'plain_text', content: `详细内容（约 ${lineCount} 行）` } },
            elements: collapsedElements,
          } as CollapsiblePanelElement);
        }

        // 保留底部 hr + note
        if (lastHrIdx >= 0) {
          visibleElements.push(...elements.slice(lastHrIdx));
        }
        return visibleElements;
      }
    }
  }

  return elements;
}

// ── 卡片构建 ────────────────────────────────────────────────────────────

/**
 * 构建"处理中"工作卡片
 *
 * 展示耗时 + 中断按钮。工具调用仅在确认来自当前对话时展示。
 */
export function buildWorkingCard(
  processName: string,
  elapsed: number,
  userQuestion: string,
  toolCalls: string[] = [],
): InteractiveCard {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
  const question = userQuestion
    ? userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion
    : '未知问题';

  // 工具调用信息仅在有内容时展示（已由调用方确保只取当前对话的工具调用）
  let toolMd = '';
  if (toolCalls.length > 0) {
    toolMd = '\n**当前操作：**\n' + toolCalls.map(t => `  ○ ${t}`).join('\n');
  }

  return {
    header: {
      title: { tag: 'plain_text', content: '⏳ Claude Code 处理中...' },
      template: 'blue',
    },
    elements: [
      {
        tag: 'markdown',
        content: `**进程：** ${processName}\n**问题：** ${question}\n**已耗时：** ${timeStr}${toolMd}`,
      },
      { tag: 'action', actions: [
        {
          tag: 'button',
          text: { tag: 'plain_text', content: '中断' },
          type: 'danger',
          value: { action: 'cc_interrupt', processName },
        },
      ]},
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [
          { tag: 'plain_text', content: '完整回复完成后将自动返回' },
        ],
      },
    ],
  };
}

/**
 * 构建超时卡片
 *
 * CLI 处理超过硬超时阈值后发送，提示用户检查 tmux 会话或重试。
 *
 * @param processName - 进程名
 * @param elapsed     - 已耗时（秒）
 * @returns 交互式卡片对象
 */
/**
 * 构建「等待用户决策」卡片
 *
 * cc/codex 弹出 Yes/No 面板时，把面板原文 + 选项列表推给飞书，
 * 用户回复"1"/"yes"/"是"等会被解析后发送给 tmux 会话。
 */
export function buildAwaitingCard(
  processName: string,
  title: string,
  options: string[],
  defaultIndex: number,
  userQuestion: string,
): InteractiveCard {
  const question = userQuestion
    ? userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion
    : '';
  const optList = options
    .map((o, i) => {
      const isDefault = i + 1 === defaultIndex;
      return `${isDefault ? '👉 ' : '   '}${o}`;
    })
    .join('\n');
  const md =
    `**进程：** ${processName}` +
    (question ? `\n**原问题：** ${question}` : '') +
    `\n**待决策：** ${title}\n\n${optList}\n\n` +
    `点击下方按钮直接选择，或回复 **序号**（\`1\`/\`2\`）/ 关键词（\`yes\`/\`no\`/\`是\`/\`否\`）`;
  // 按钮组：每个选项一个按钮，最多 5 个（飞书 actions 单行容量限制）
  const buttons: ButtonElement[] = options.slice(0, 5).map((opt, i) => {
    const idx = i + 1;
    const isDefault = idx === defaultIndex;
    // 标签精简：去掉前面的"1. "之类前缀，限制长度
    const label = opt.replace(/^\s*\d+\.\s*/, '').trim();
    const display = label.length > 16 ? label.slice(0, 16) + '…' : label;
    return {
      tag: 'button',
      text: { tag: 'plain_text', content: `${idx}. ${display}${isDefault ? ' ⭐' : ''}` },
      type: isDefault ? 'primary' : 'default',
      value: {
        action: 'cc_choice',
        processName,
        optionIndex: idx,
      },
    };
  });
  return {
    header: {
      title: { tag: 'plain_text', content: '⚠️ 【告警】Claude Code 等待你的决策' },
      template: 'orange',
    },
    elements: [
      { tag: 'markdown', content: md },
      { tag: 'action', actions: buttons },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '回复后将转发到 cc 会话；超时未回复保持等待' }] },
    ],
  };
}

/**
 * 构建「决策已转发」回执卡片
 *
 * sendChoice 成功后发送，告知用户选择已注入 cc 进程，等待后续输出。
 */
export function buildChoiceAckCard(
  processName: string,
  chosenLabel: string,
  optionIndex: number,
): InteractiveCard {
  return {
    header: {
      title: { tag: 'plain_text', content: '🔔 【通知】决策已转发' },
      template: 'green',
    },
    elements: [
      {
        tag: 'markdown',
        content:
          `**进程：** ${processName}\n` +
          `**已选择：** ${optionIndex}. ${chosenLabel}\n\n` +
          `已注入 Claude Code 会话，正在等待后续输出...`,
      },
      { tag: 'hr' },
      {
        tag: 'note',
        elements: [{ tag: 'plain_text', content: '处理完成后将自动返回结果' }],
      },
    ],
  };
}

/**
 * 构建「决策回复无法识别」提示卡片
 *
 * sendChoice 失败（识别不出用户回复内容）时发送，列出当前可选项让用户重发。
 */
export function buildChoiceUnrecognizedCard(
  processName: string,
  userReply: string,
  options: string[],
): InteractiveCard {
  const optList = options.map((o, i) => `${i + 1}. ${o.replace(/^\s*\d+\.\s*/, '').trim()}`).join('\n');
  return {
    header: {
      title: { tag: 'plain_text', content: '⚠️ 【告警】无法识别您的选择' },
      template: 'orange',
    },
    elements: [
      {
        tag: 'markdown',
        content:
          `**进程：** ${processName}\n` +
          `**您的回复：** \`${userReply.length > 30 ? userReply.slice(0, 30) + '…' : userReply}\`\n\n` +
          `当前可选项：\n${optList}\n\n` +
          `请回复 **序号**（如 \`1\`）或 **关键词**（\`yes\`/\`no\`/\`是\`/\`否\`）重新选择`,
      },
    ],
  };
}

/** 构建中断确认卡片 */
export function buildInterruptAckCard(processName: string): InteractiveCard {
  return {
    header: {
      title: { tag: 'plain_text', content: '🔔 【通知】已中断' },
      template: 'green',
    },
    elements: [
      {
        tag: 'markdown',
        content: `进程 **${processName}** 已发送中断指令（Escape）。`,
      },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: 'cc 将停止当前操作，回到空闲状态' }] },
    ],
  };
}

/** 构建进程状态看板卡片 */
export function buildStatusCard(
  processName: string,
  rows: Array<{ process: string; state: string; elapsed: number }>,
): InteractiveCard {
  if (rows.length === 0) {
    return {
      header: { title: { tag: 'plain_text', content: '📊 进程看板' }, template: 'blue' },
      elements: [{ tag: 'markdown', content: '当前没有活跃进程' }],
    };
  }
  const tableMd = rows.map(r => {
    const elapsed = r.elapsed > 0 ? `${Math.floor(r.elapsed / 60)}m${r.elapsed % 60}s` : '-';
    return `| ${r.process} | ${r.state} | ${elapsed} |`;
  }).join('\n');
  const md = `| 进程 | 状态 | 耗时 |\n| --- | --- | --- |\n${tableMd}`;
  return {
    header: { title: { tag: 'plain_text', content: '📊 进程看板' }, template: 'blue' },
    elements: [
      { tag: 'markdown', content: `**当前进程：** ${processName}\n\n${md}` },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '使用 /status 刷新 · /interrupt 中断' }] },
    ],
  };
}

/** 构建帮助卡片 */
export function buildHelpCard(processName: string): InteractiveCard {
  return {
    header: { title: { tag: 'plain_text', content: '📖 /命令帮助' }, template: 'blue' },
    elements: [
      {
        tag: 'markdown',
        content:
          `**进程：** ${processName}\n\n` +
          `| 命令 | 功能 |\n| --- | --- |\n` +
          `| /status | 查看所有进程状态 |\n| /interrupt | 中断当前执行 |\n| /model \\<id\\> | 切换模型（重启 cc） |\n| /effort \\<level\\> | 调整 effort（重启 cc） |`,
      },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '命令不区分大小写 · 非 / 开头消息照常发给 cc' }] },
    ],
  };
}

export function buildTimeoutCard(processName: string, elapsed: number): InteractiveCard {
  const mm = Math.floor(elapsed / 60);
  return {
    header: {
      title: { tag: 'plain_text', content: '⏰ Claude Code 处理超时' },
      template: 'orange',
    },
    elements: [
      {
        tag: 'markdown',
        content: `进程 **${processName}** 处理超过 ${mm} 分钟，已自动停止等待。\n请检查 tmux 会话或重试。`,
      },
    ],
  };
}

/**
 * 发送完整回复卡片
 *
 * 包含头部信息（用户问题、进程名、耗时）+ 回复正文 + 时间戳注脚。
 * 超时兜底时使用橙色头部，正常回复使用蓝色头部。
 * 回复正文中的表格自动转为飞书原生 table 元素。
 *
 * @param appId         - 飞书应用 App ID
 * @param appSecret     - 飞书应用 App Secret
 * @param receiveIdType - 接收者 ID 类型
 * @param receiveId     - 接收者 ID
 * @param opts          - 回复卡片选项
 * @returns 飞书 API 响应 JSON
 */
export function sendReplyCard(
  appId: string,
  appSecret: string,
  receiveIdType: string,
  receiveId: string,
  opts: ReplyCardOptions,
): Promise<FeishuApiResponse> {
  const { processName, userQuestion, reply, elapsed, isTimeout, toolCount, timing, costUsdEstimated } = opts;

  const elapsedStr =
    elapsed != null
      ? elapsed >= 60
        ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s`
        : `${elapsed}s`
      : '-';

  const q =
    (userQuestion || '').length > 80
      ? userQuestion.slice(0, 80) + '...'
      : userQuestion || '';

  const elements: CardElement[] = [
    {
      tag: 'markdown',
      content: `**问题：** ${q}\n**进程：** ${processName} · **耗时：** ${elapsedStr}${isTimeout ? ' · ⚠️ 已达硬超时' : ''}`,
    },
    { tag: 'hr' },
  ];

  // 回复正文：表格转原生 table 元素，文字转 markdown 元素
  const replyElements = replyToCardElements(reply || '');
  elements.push(...replyElements);

  // 底部统计 note
  const timingStr = timing ? ` · ⏱ cc ${timing}s` : '';
  const toolStr = toolCount
    ? Object.entries(toolCount).map(([k, v]) => `${k}×${v}`).join(' · ')
    : '';
  const costStr = costUsdEstimated ? ` · 💰 ≈$${costUsdEstimated.toFixed(4)}` : '';

  elements.push({ tag: 'hr' });
  elements.push({
    tag: 'note',
    elements: [
      {
        tag: 'plain_text',
        content: `⏱ 总计 ${elapsedStr}${timingStr}${toolStr ? ' · 🔧 ' + toolStr : ''}${costStr} · ${new Date().toLocaleString('zh-CN')}`,
      },
    ],
  });

  return sendCard(appId, appSecret, receiveIdType, receiveId, {
    header: {
      title: {
        tag: 'plain_text',
        content: isTimeout
          ? '⚠️ Claude Code 回复（已超时兜底）'
          : '✅ Claude Code 回复',
      },
      template: isTimeout ? 'orange' : 'blue',
    },
    elements,
  });
}
