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

// 发送 Markdown 消息（用 interactive 卡片承载，支持表格/代码块/加粗等）
function sendMarkdown(appId, appSecret, receiveIdType, receiveId, md) {
  // 转义 markdown 中的特殊字符，避免飞书卡片 JSON 解析失败
  return sendCard(appId, appSecret, receiveIdType, receiveId, {
    header: { title: { tag: 'plain_text', content: 'Claude Code 回复' }, template: 'blue' },
    elements: [
      { tag: 'markdown', content: md }
    ]
  });
}

// 发送交互式卡片
function sendCard(appId, appSecret, receiveIdType, receiveId, card) {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'interactive', card);
}

// 构建进度卡片
function buildProgressCard(processName, elapsed, userQuestion) {
  const minutes = Math.ceil(elapsed / 60);
  // 截断用户问题到 50 字
  const question = userQuestion ? (userQuestion.length > 50 ? userQuestion.slice(0, 50) + '...' : userQuestion) : '未知问题';

  return {
    header: {
      title: { tag: 'plain_text', content: `⏳ 正在进行中...` },
      template: 'blue'
    },
    elements: [
      { tag: 'markdown', content: `我正在处理「**${question}**」\n已累计处理 **${minutes}** 分钟，请稍候...` },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '完整回复完成后将自动返回' }] }
    ]
  };
}

// 构建超时卡片
function buildTimeoutCard(processName, elapsed) {
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  return {
    header: {
      title: { tag: 'plain_text', content: `⏰ Claude Code [进程 ${processName}] 处理超时` },
      template: 'orange'
    },
    elements: [
      { tag: 'markdown', content: `进程 **${processName}** 处理超过 ${mm} 分钟，已自动停止等待。\n请检查进程状态后重试。` }
    ]
  };
}

module.exports = { getAccessToken, sendText, sendMarkdown, sendCard, buildProgressCard, buildTimeoutCard };
