const https = require('https');
const logger = require('../middleware/logger');

// 每个 app_id 独立缓存 token
const tokenCaches = {};

function getAccessToken(appId, appSecret) {
  return new Promise((resolve, reject) => {
    const cache = tokenCaches[appId];
    if (cache && cache.token && cache.expires > Date.now()) {
      return resolve(cache.token);
    }

    const body = JSON.stringify({ app_id: appId, app_secret: appSecret });

    const req = https.request({
      hostname: 'open.feishu.cn',
      path: '/open-apis/auth/v3/tenant_access_token/internal',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.code === 0) {
            tokenCaches[appId] = { token: json.tenant_access_token, expires: Date.now() + (json.expire - 60) * 1000 };
            resolve(tokenCaches[appId].token);
          } else {
            reject(new Error(`Token 获取失败: ${json.msg}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 发送消息到指定目标
function sendMessage(appId, appSecret, receiveIdType, receiveId, msgType, content) {
  return new Promise((resolve, reject) => {
    getAccessToken(appId, appSecret).then(token => {
      const body = JSON.stringify({
        receive_id: receiveId,
        msg_type: msgType,
        content: JSON.stringify(content)
      });

      const req = https.request({
        hostname: 'open.feishu.cn',
        path: `/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.code !== 0) {
              logger.log('error', `[sender] 飞书 API 错误 code=${json.code} msg=${json.msg}`, JSON.stringify(json).slice(0, 300));
              reject(new Error(`飞书 API 错误 ${json.code}: ${json.msg}`));
            } else {
              resolve(json);
            }
          } catch (e) {
            logger.log('error', '[sender] 响应解析失败', data.slice(0, 200));
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch(reject);
  });
}

// 发送文本消息
function sendText(appId, appSecret, receiveIdType, receiveId, text) {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'text', { text });
}

// 超长文本分段（飞书单 markdown element ≈ 4000 字符以内）
function chunkMarkdown(md, maxLen = 4000) {
  if (md.length <= maxLen) return [md];
  const chunks = [];
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

// ── 表格解析：将 GFM / box-drawing 表格转为飞书原生 table 元素 ──

// 解析 GFM 表格行（| col | col | + | --- | --- |）
function parseGfmTable(tblLines) {
  const parseRow = line =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  const headers = parseRow(tblLines[0]);
  const dataRows = tblLines.slice(2).map(parseRow); // 跳过 | --- | 分隔行

  if (!headers.length) return null;

  const columns = headers.map((h, idx) => ({
    name: `c${idx}`,
    display_name: h || `列${idx + 1}`,
    data_type: 'text'
  }));

  const rows = dataRows
    .filter(r => r.some(c => c))
    .map(row => {
      const obj = {};
      headers.forEach((_, idx) => { obj[`c${idx}`] = row[idx] || ''; });
      return obj;
    });

  if (!rows.length) return null;
  return { tag: 'table', columns, rows, row_height: 'middle' };
}

// 解析 box-drawing 表格（┌─┐/├─┤/└─┘ 分隔，│ 行为数据）
function parseBoxDrawingTable(tblLines) {
  // 只取数据行（以 │ 开头且不是分隔行 ┌├└）
  const dataLines = tblLines.filter(l => {
    const t = l.trim();
    return t.startsWith('│') && !/^[┌├└]/.test(t);
  });

  if (!dataLines.length) return null;

  const parseRow = line =>
    line.split('│').slice(1, -1).map(cell => cell.trim());

  const allRows = dataLines.map(parseRow);
  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  if (!headers || !headers.length) return null;

  const columns = headers.map((h, idx) => ({
    name: `c${idx}`,
    display_name: h || `列${idx + 1}`,
    data_type: 'text'
  }));

  const rows = dataRows
    .filter(r => r.some(c => c))
    .map(row => {
      const obj = {};
      headers.forEach((_, idx) => { obj[`c${idx}`] = row[idx] || ''; });
      return obj;
    });

  if (!rows.length) return null;
  return { tag: 'table', columns, rows, row_height: 'middle' };
}

// 将 markdown 文本转换为飞书卡片 elements 数组
// 表格（GFM / box-drawing）→ 原生 { tag: 'table' } 元素（每张卡片最多 4 个，超出转代码块）
// 其余文本 → { tag: 'markdown' } 元素（超长自动分段）
const FEISHU_TABLE_LIMIT = 4;

function replyToCardElements(md) {
  if (!md) return [];
  const lines = md.split('\n');
  const elements = [];
  let textBuf = [];
  let i = 0;
  let inCodeBlock = false;
  let tableCount = 0;

  function flushText() {
    const text = textBuf.join('\n').trim();
    textBuf = [];
    if (!text) return;
    chunkMarkdown(text, 4000).forEach(c =>
      elements.push({ tag: 'markdown', content: c })
    );
  }

  function pushTable(tblLines, el) {
    if (el && tableCount < FEISHU_TABLE_LIMIT) {
      elements.push(el);
      tableCount++;
    } else {
      // 超出上限或解析失败：用代码块保持等宽对齐
      elements.push({ tag: 'markdown', content: '```\n' + tblLines.join('\n') + '\n```' });
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
      if (/\|/.test(line) &&
          i + 1 < lines.length &&
          /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[i + 1])) {
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

      // box-drawing 表格：含角/交叉字符，或同行 ≥2 个 │
      const isBox = /[┌┐└┘├┤┬┴┼╪╫]/.test(line) ||
        (line.match(/│/g) || []).length >= 2;
      if (isBox) {
        flushText();
        const tbl = [line];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (/[┌┐└┘├┤┬┴┼╪╫]/.test(next) || (next.match(/│/g) || []).length >= 2) {
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
  return elements;
}

// 发送 Markdown 消息（用 interactive 卡片承载，表格自动转原生元素）
function sendMarkdown(appId, appSecret, receiveIdType, receiveId, md) {
  return sendCard(appId, appSecret, receiveIdType, receiveId, {
    header: { title: { tag: 'plain_text', content: 'Claude Code 回复' }, template: 'blue' },
    elements: replyToCardElements(md)
  });
}

// ── 完整回复卡片（带头部信息 + 用户问题 + 回复正文 + 耗时） ──
function sendReplyCard(appId, appSecret, receiveIdType, receiveId, opts) {
  const { processName, userQuestion, reply, elapsed, isTimeout } = opts;

  const elapsedStr = elapsed != null
    ? (elapsed >= 60 ? `${Math.floor(elapsed / 60)}m${elapsed % 60}s` : `${elapsed}s`)
    : '-';

  const q = (userQuestion || '').length > 80
    ? userQuestion.slice(0, 80) + '...'
    : (userQuestion || '');

  const elements = [
    { tag: 'markdown', content: `**问题：** ${q}\n**进程：** ${processName} · **耗时：** ${elapsedStr}${isTimeout ? ' · ⚠️ 已达硬超时' : ''}` },
    { tag: 'hr' }
  ];

  // 回复正文：表格转原生 table 元素，文字转 markdown 元素
  elements.push(...replyToCardElements(reply || ''));

  elements.push({ tag: 'hr' });
  elements.push({ tag: 'note', elements: [{ tag: 'plain_text', content: `Claude Code · ${new Date().toLocaleString('zh-CN')}` }] });

  return sendCard(appId, appSecret, receiveIdType, receiveId, {
    header: {
      title: { tag: 'plain_text', content: isTimeout ? `⚠️ Claude Code 回复（已超时兜底）` : `✅ Claude Code 回复` },
      template: isTimeout ? 'orange' : 'blue'
    },
    elements
  });
}

// 发送交互式卡片
function sendCard(appId, appSecret, receiveIdType, receiveId, card) {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'interactive', card);
}

// 构建进度卡片
function buildProgressCard(processName, elapsed, userQuestion) {
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  const timeStr = minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
  const question = userQuestion ? (userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion) : '未知问题';

  return {
    header: {
      title: { tag: 'plain_text', content: `⏳ Claude Code 处理中...` },
      template: 'blue'
    },
    elements: [
      { tag: 'markdown', content: `**进程：** ${processName}\n**问题：** ${question}\n**已耗时：** ${timeStr}` },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '完整回复完成后将自动返回' }] }
    ]
  };
}

// 构建超时卡片
function buildTimeoutCard(processName, elapsed) {
  const mm = Math.floor(elapsed / 60);
  return {
    header: {
      title: { tag: 'plain_text', content: `⏰ Claude Code 处理超时` },
      template: 'orange'
    },
    elements: [
      { tag: 'markdown', content: `进程 **${processName}** 处理超过 ${mm} 分钟，已自动停止等待。\n请检查 tmux 会话或重试。` }
    ]
  };
}

module.exports = {
  getAccessToken,
  sendText,
  sendMarkdown,
  sendCard,
  sendReplyCard,
  buildProgressCard,
  buildTimeoutCard,
  chunkMarkdown,
  replyToCardElements
};
