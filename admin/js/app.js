const API = '';

// ── 主题切换 ──
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

// 初始化主题
(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

// ── Toast ──
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

// ── API 请求 ──
async function apiGet(path) {
  const res = await fetch(`${API}${path}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

// ── 刷新状态 ──
async function refreshStatus() {
  const tbody = document.getElementById('statusTable');
  try {
    const statusRes = await apiGet('/api/status');
    const sessionsRes = await apiGet('/api/sessions');

    const bindings = statusRes.data || [];
    const sessions = sessionsRes.data || [];

    // 更新统计
    document.getElementById('statTotal').textContent = bindings.length;
    document.getElementById('statOnline').textContent = bindings.filter(b => b.status === 'online').length;
    document.getElementById('statOffline').textContent = bindings.filter(b => b.status === 'offline').length;
    document.getElementById('statSessions').textContent = sessions.length;

    if (bindings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="color: var(--text-secondary); text-align: center; padding: 32px;">暂无绑定。请在上方表单创建绑定。</td></tr>`;
      return;
    }

    tbody.innerHTML = bindings.map(b => `
      <tr>
        <td><span class="font-medium">${esc(b.process_name)}</span></td>
        <td><code style="font-size: 12px">${esc(b.feishu_target || '-')}</code></td>
        <td>${b.feishu_type === 'user' ? '👤 用户' : '👥 群聊'}</td>
        <td><span class="badge ${b.status === 'online' ? 'badge-online' : 'badge-offline'}">${b.status === 'online' ? '在线' : '离线'}</span></td>
        <td style="color: var(--text-secondary); font-size: 13px">${b.created_at ? new Date(b.created_at).toLocaleString('zh-CN') : '-'}</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="doUnbind('${esc(b.process_name)}')">解绑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; text-align: center; padding: 32px;">加载失败: ${esc(e.message)}</td></tr>`;
  }
}

// ── 绑定操作 ──
document.getElementById('bindForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const process_name = document.getElementById('bindProcess').value.trim();
  const feishu_target = document.getElementById('bindTarget').value.trim();
  const feishu_type = document.getElementById('bindType').value;

  if (!process_name || !feishu_target) {
    toast('请填写进程名和飞书目标 ID', 'error');
    return;
  }

  const result = await apiPost('/api/bind', { process_name, feishu_target, feishu_type });
  if (result.code === 0) {
    toast(`绑定成功: ${process_name} → ${feishu_target}`, 'success');
    document.getElementById('bindForm').reset();
    refreshStatus();
  } else {
    toast(result.message || '绑定失败', 'error');
  }
});

async function doUnbind(process_name) {
  if (!confirm(`确认解除进程 "${process_name}" 的绑定？`)) return;

  const result = await apiPost('/api/unbind', { process_name });
  if (result.code === 0) {
    toast(`已解绑: ${process_name}`, 'success');
    refreshStatus();
  } else {
    toast(result.message || '解绑失败', 'error');
  }
}

// ── 日志 ──
async function refreshLogs() {
  const container = document.getElementById('logContainer');
  try {
    const result = await apiGet('/api/logs');
    const logs = result.data || [];
    if (logs.length === 0) {
      container.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 24px;">暂无日志</p>';
      return;
    }
    container.innerHTML = logs.map(l => {
      const levelClass = l.level === 'error' ? 'log-error' : l.level === 'warn' ? 'log-warn' : 'log-info';
      const time = l.ts ? new Date(l.ts).toLocaleTimeString('zh-CN') : '';
      const msg = l.message || l.raw || JSON.stringify(l);
      return `<div class="log-entry ${levelClass}"><span style="color: var(--text-secondary)">${time}</span> ${esc(msg)}</div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<p style="color: #ef4444; text-align: center; padding: 24px;">加载失败: ${esc(e.message)}</p>`;
  }
}

// ── 工具 ──
function esc(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── 自动轮询 ──
refreshStatus();
setInterval(refreshStatus, 3000);
