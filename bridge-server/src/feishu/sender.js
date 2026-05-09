const https = require('https');

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
            resolve(json);
          } catch (e) {
            resolve({ error: data });
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

// ── Markdown 预处理（适配飞书卡片 markdown tag 的有限语法） ──
// 飞书卡片 markdown 不支持 GFM 表格 / box-drawing 表格直接渲染
// 两类表格均自动包入代码块（等宽字体），保持对齐
function sanitizeMarkdownForFeishu(md) {
  if (!md) return '';
  const lines = String(md).split('\n');
  const out = [];
  let i = 0;
  let inCodeBlock = false;

  while (i < lines.length) {
    const line = lines[i];

    // 跟踪已有代码块，避免二次包裹
    if (/^\s*```/.test(line)) {
      inCodeBlock = !inCodeBlock;
      out.push(line);
      i++;
      continue;
    }

    if (!inCodeBlock) {
      // ── 检测 GFM 表格：当前行含 |，下一行是分隔行 | --- | ──
      const isGfmHeader = /\|/.test(line) &&
        i + 1 < lines.length &&
        /^\s*\|?[\s:|-]+\|[\s:|-]*\|?\s*$/.test(lines[i + 1]);

      if (isGfmHeader) {
        const tbl = [line];
        i++;
        tbl.push(lines[i]); // 分隔行
        i++;
        while (i < lines.length && /\|/.test(lines[i])) {
          tbl.push(lines[i]);
          i++;
        }
        out.push('```');
        out.push(...tbl);
        out.push('```');
        continue;
      }

      // ── 检测 box-drawing 表格（┌┬┐/├┼┤/└┴┘ 风格） ──
      // 边框行：含角/交叉字符；内容行：含两个以上 │
      const isBoxLine = /[┌┐└┘├┤┬┴┼╪╫]/.test(line) || /│[^│\n]*│/.test(line);

      if (isBoxLine) {
        const tbl = [line];
        i++;
        while (i < lines.length) {
          const next = lines[i];
          if (/[┌┐└┘├┤┬┴┼╪╫]/.test(next) || /│[^│\n]*│/.test(next)) {
            tbl.push(next);
            i++;
          } else {
            break;
          }
        }
        out.push('```');
        out.push(...tbl);
        out.push('```');
        continue;
      }
    }

    out.push(line);
    i++;
  }

  return out.join('\n');
}

// 截断到飞书卡片单元素安全长度（飞书 elements 单 markdown ≈ 30000 字符以内）
function chunkMarkdown(md, maxLen = 4000) {
  if (md.length <= maxLen) return [md];
  const chunks = [];
  let rest = md;
  while (rest.length > maxLen) {
    // 尽量在换行处切
    let cut = rest.lastIndexOf('\n', maxLen);
    if (cut < maxLen / 2) cut = maxLen;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// 发送 Markdown 消息（用 interactive 卡片承载）
function sendMarkdown(appId, appSecret, receiveIdType, receiveId, md) {
  return sendCard(appId, appSecret, receiveIdType, receiveId, {
    header: { title: { tag: 'plain_text', content: 'Claude Code 回复' }, template: 'blue' },
    elements: [
      { tag: 'markdown', content: sanitizeMarkdownForFeishu(md) }
    ]
  });
}

// ── 完整回复卡片（带头部信息 + 用户问题 + 回复正文 + 耗时） ──
function sendReplyCard(appId, appSecret, receiveIdType, receiveId, opts) {
  const { processName, userQuestion, reply, elapsed, isTimeout } = opts;
  const safeReply = sanitizeMarkdownForFeishu(reply || '');
  const chunks = chunkMarkdown(safeReply, 4500);

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

  for (const c of chunks) {
    elements.push({ tag: 'markdown', content: c });
  }

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
  sanitizeMarkdownForFeishu,
  chunkMarkdown
};
