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

// 发送交互式卡片
function sendCard(appId, appSecret, receiveIdType, receiveId, card) {
  return sendMessage(appId, appSecret, receiveIdType, receiveId, 'interactive', card);
}

// 构建进度卡片
function buildProgressCard(processName, elapsed, outputSnippet) {
  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');
  const snippet = outputSnippet ? outputSnippet.slice(-200) : '(暂无输出)';

  return {
    header: {
      title: { tag: 'plain_text', content: `⏳ Claude Code [进程 ${processName}] 处理中...` },
      template: 'blue'
    },
    elements: [
      { tag: 'markdown', content: `**已用时：** ${mm}:${ss}\n**输出片段：**\n\`\`\`\n${snippet}\n\`\`\`` },
      { tag: 'hr' },
      { tag: 'note', elements: [{ tag: 'plain_text', content: '完整回复即将返回，请稍候...' }] }
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

module.exports = { getAccessToken, sendText, sendCard, buildProgressCard, buildTimeoutCard };
