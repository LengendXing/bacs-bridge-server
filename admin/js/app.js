const API = '';

// ── 主题切换 ──
function toggleTheme() {
  document.documentElement.classList.toggle('dark');
  localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
}

(function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
})();

// ── Auth ──
function getToken() {
  return sessionStorage.getItem('auth_token');
}

async function apiGet(path) {
  const headers = {};
  const token = getToken();
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 401) {
    sessionStorage.removeItem('auth_token');
    showLogin();
    throw new Error('未登录');
  }
  return res.json();
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  if (res.status === 401) {
    sessionStorage.removeItem('auth_token');
    showLogin();
    throw new Error('未登录');
  }
  return res.json();
}

// ── 登录 ──
function showLogin() {
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('mainPanel').classList.add('hidden');
}

function hideLogin() {
  document.getElementById('loginOverlay').classList.add('hidden');
  document.getElementById('mainPanel').classList.remove('hidden');
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');

  try {
    const result = await fetch(`${API}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }).then(r => r.json());

    if (result.code === 0 && result.data?.token) {
      sessionStorage.setItem('auth_token', result.data.token);
      hideLogin();
      toast('登录成功', 'success');
      refreshStatus();
      loadSessions();
    } else {
      errEl.textContent = result.message || '密码错误';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = '网络错误，请重试';
    errEl.classList.remove('hidden');
  }
});

async function doLogout() {
  await fetch(`${API}/api/logout`, {
    method: 'POST',
    headers: { 'X-Auth-Token': getToken() }
  });
  sessionStorage.removeItem('auth_token');
  showLogin();
  toast('已退出登录', 'info');
}

// 检查登录状态
(function checkAuth() {
  if (getToken()) {
    hideLogin();
  } else {
    showLogin();
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

// ── 加载进程下拉列表 ──
async function loadSessions() {
  if (!getToken()) return;
  try {
    const result = await apiGet('/api/sessions');
    const sessions = result.data || [];
    const select = document.getElementById('modalBindProcess');
    if (!select) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">-- 选择运行中的 CC 进程 --</option>';
    if (sessions.length === 0) {
      select.innerHTML += '<option value="" disabled>暂无运行中的 CC 进程</option>';
    } else {
      sessions.forEach(s => {
        const sel = s === currentValue ? ' selected' : '';
        select.innerHTML += `<option value="${esc(s)}"${sel}>${esc(s)}</option>`;
      });
    }
  } catch (e) {
    // ignore
  }
}

// ── 刷新状态 ──
async function refreshStatus() {
  const tbody = document.getElementById('statusTable');
  if (!getToken()) return;
  try {
    const statusRes = await apiGet('/api/status');
    const sessionsRes = await apiGet('/api/sessions');

    const bindings = statusRes.data || [];
    const sessions = sessionsRes.data || [];

    document.getElementById('statTotal').textContent = bindings.length;
    document.getElementById('statOnline').textContent = bindings.filter(b => b.status === 'online').length;
    document.getElementById('statOffline').textContent = bindings.filter(b => b.status === 'offline').length;
    document.getElementById('statSessions').textContent = sessions.length;

    if (bindings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="color: var(--text-secondary); text-align: center; padding: 32px;">暂无绑定。点击上方「新建」按钮创建绑定。</td></tr>`;
      return;
    }

    tbody.innerHTML = bindings.map(b => `
      <tr>
        <td><span class="font-medium">${esc(b.process_name)}</span></td>
        <td><code style="font-size: 12px">${esc(b.feishu_app_id || '-')}</code></td>
        <td><span class="badge ${b.ws_connected ? 'badge-online' : 'badge-offline'}">${b.ws_connected ? '已连接' : '未连接'}</span></td>
        <td><span class="badge ${b.status === 'online' ? 'badge-online' : 'badge-offline'}">${b.status === 'online' ? '在线' : '离线'}</span></td>
        <td style="color: var(--text-secondary); font-size: 13px">${b.created_at ? new Date(b.created_at).toLocaleString('zh-CN') : '-'}</td>
        <td style="white-space: nowrap;">
          <button class="btn btn-sm" style="background: #6366f1; color: #fff; border: none; margin-right: 6px;" onclick="copyTermCmd('${esc(b.process_name)}', '${esc(b.session_id || '')}')">复制终端命令</button>
          <button class="btn btn-danger btn-sm" onclick="doUnbind('${esc(b.process_name)}')">解绑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" style="color: #ef4444; text-align: center; padding: 32px;">加载失败: ${esc(e.message)}</td></tr>`;
  }
}

// ── Modal 新建绑定 ──
function openBindModal() {
  loadSessions();
  document.getElementById('bindModal').classList.remove('hidden');
}

function closeBindModal() {
  document.getElementById('bindModal').classList.add('hidden');
  document.getElementById('bindModalForm').reset();
}

document.getElementById('btnNewBind').addEventListener('click', openBindModal);
document.getElementById('btnCancelBind').addEventListener('click', closeBindModal);
document.getElementById('bindModal').addEventListener('click', function(e) {
  if (e.target === this) closeBindModal();
});

document.getElementById('bindModalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const process_name = document.getElementById('modalBindProcess').value;
  const feishu_app_id = document.getElementById('modalBindAppId').value.trim();
  const feishu_app_secret = document.getElementById('modalBindAppSecret').value.trim();

  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    toast('请选择进程并填写 App ID 和 App Secret', 'error');
    return;
  }

  const result = await apiPost('/api/bind', { process_name, feishu_app_id, feishu_app_secret });
  if (result.code === 0) {
    toast(`绑定成功: ${process_name} → ${feishu_app_id}`, 'success');
    closeBindModal();
    refreshStatus();
    loadSessions();
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
    loadSessions();
  } else {
    toast(result.message || '解绑失败', 'error');
  }
}

// ── 日志 ──
async function refreshLogs() {
  const container = document.getElementById('logContainer');
  if (!getToken()) return;
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
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function copyTermCmd(processName, sessionId) {
  const cmd = sessionId ? `claude -r ${sessionId}` : `claude`;
  navigator.clipboard.writeText(cmd).then(() => {
    toast(`已复制终端命令: ${cmd}`, 'success');
  }).catch(() => {
    toast('复制失败，请手动复制', 'error');
  });
}

// ── Tab 切换 ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById('tab-' + btn.dataset.tab);
    if (target) target.classList.add('active');
  });
});

// ── 自动轮询 ──
if (getToken()) {
  refreshStatus();
  loadSessions();
}
setInterval(() => {
  if (getToken()) refreshStatus();
}, 3000);
setInterval(() => {
  if (getToken()) loadSessions();
}, 10000);
