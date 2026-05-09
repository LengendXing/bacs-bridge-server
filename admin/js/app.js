const API = '';

// ── 主题 ──
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
function getToken() { return sessionStorage.getItem('auth_token'); }

async function apiGet(path) {
  const headers = {};
  const token = getToken();
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(`${API}${path}`, { headers });
  if (res.status === 401) { sessionStorage.removeItem('auth_token'); showLogin(); throw new Error('未登录'); }
  return res.json();
}

async function apiPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['X-Auth-Token'] = token;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (res.status === 401) { sessionStorage.removeItem('auth_token'); showLogin(); throw new Error('未登录'); }
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
    } else {
      errEl.textContent = result.message || '密码错误';
      errEl.classList.remove('hidden');
    }
  } catch {
    errEl.textContent = '网络错误，请重试';
    errEl.classList.remove('hidden');
  }
});

async function doLogout() {
  await fetch(`${API}/api/logout`, { method: 'POST', headers: { 'X-Auth-Token': getToken() } });
  sessionStorage.removeItem('auth_token');
  showLogin();
  toast('已退出登录', 'info');
}

(function checkAuth() {
  if (getToken()) hideLogin(); else showLogin();
})();

// ── Toast ──
function toast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }, 2800);
}

// ── 复制工具（HTTP/HTTPS 双环境兼容）──
function copyToClipboard(text) {
  return new Promise((resolve, reject) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(resolve).catch(reject);
      return;
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-1000px;left:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.focus(); ta.select(); ta.setSelectionRange(0, text.length);
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand failed'));
    } catch (e) { reject(e); }
  });
}

function copyTermCmd(processName) {
  const cmd = `tmux attach -t claude-${processName}`;
  copyToClipboard(cmd)
    .then(() => toast(`已复制：${cmd}`, 'success'))
    .catch(() => window.prompt('自动复制失败，请手动复制：', cmd));
}

// ── Claude 模式切换（工厂函数，支持多个表单）──
function setupClaudeModeToggle(radioName, customFieldsId) {
  document.querySelectorAll(`input[name="${radioName}"]`).forEach(radio => {
    radio.addEventListener('change', () => {
      const f = document.getElementById(customFieldsId);
      if (radio.checked) {
        radio.value === 'custom' ? f.classList.remove('hidden') : f.classList.add('hidden');
      }
    });
  });
}

// ── 刷新状态 ──
async function refreshStatus() {
  const tbody = document.getElementById('statusTable');
  if (!getToken()) return;
  try {
    const [statusRes, sessionsRes] = await Promise.all([
      apiGet('/api/status'),
      apiGet('/api/sessions')
    ]);
    const bindings = statusRes.data || [];
    const sessions = sessionsRes.data || [];

    document.getElementById('statTotal').textContent = bindings.length;
    document.getElementById('statOnline').textContent = bindings.filter(b => b.status === 'online').length;
    document.getElementById('statOffline').textContent = bindings.filter(b => b.status === 'offline').length;
    document.getElementById('statSessions').textContent = sessions.length;

    if (bindings.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="color:var(--text-secondary);text-align:center;padding:32px;">暂无绑定。点击「+ 新建」按钮创建绑定。</td></tr>`;
      return;
    }

    tbody.innerHTML = bindings.map(b => `
      <tr>
        <td><span class="font-medium">${esc(b.process_name)}</span></td>
        <td><code style="font-size:12px">${esc(b.feishu_app_id || '-')}</code></td>
        <td><span class="badge ${b.ws_connected ? 'badge-online' : 'badge-offline'}">${b.ws_connected ? '已连接' : '未连接'}</span></td>
        <td><span class="badge ${b.status === 'online' ? 'badge-online' : 'badge-offline'}">${b.status === 'online' ? '在线' : '离线'}</span></td>
        <td><span class="badge" style="background:${b.claude_mode === 'custom' ? 'rgba(99,102,241,.15)' : 'var(--border)'};color:${b.claude_mode === 'custom' ? '#6366f1' : 'var(--text-secondary)'}">${b.claude_mode === 'custom' ? '自定义' : '系统环境'}</span></td>
        <td style="color:var(--text-secondary);font-size:13px">${b.created_at ? new Date(b.created_at).toLocaleString('zh-CN') : '-'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-sm" style="margin-right:4px;" onclick="copyTermCmd('${esc(b.process_name)}')" title="复制 tmux attach 命令">Attach</button>
          <button class="btn btn-sm" style="background:#6366f1;color:#fff;border:none;margin-right:4px;" onclick="openEditModal('${esc(b.process_name)}')">编辑</button>
          <button class="btn btn-danger btn-sm" onclick="openUnbindModal('${esc(b.process_name)}')">解绑</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#ef4444;text-align:center;padding:32px;">加载失败: ${esc(e.message)}</td></tr>`;
  }
}

// ── 新建绑定 Modal ──
function openBindModal() {
  document.getElementById('bindModalForm').reset();
  document.getElementById('bindCustomFields').classList.add('hidden');
  document.getElementById('bindModal').classList.remove('hidden');
}
function closeBindModal() {
  document.getElementById('bindModal').classList.add('hidden');
}

document.getElementById('btnNewBind').addEventListener('click', openBindModal);
document.getElementById('btnCancelBind').addEventListener('click', closeBindModal);
document.getElementById('bindModal').addEventListener('click', function(e) {
  if (e.target === this) closeBindModal();
});

document.getElementById('bindModalForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const process_name = document.getElementById('modalBindProcess').value.trim();
  const feishu_app_id = document.getElementById('modalBindAppId').value.trim();
  const feishu_app_secret = document.getElementById('modalBindAppSecret').value.trim();
  const claude_mode = document.querySelector('input[name="bindClaudeMode"]:checked')?.value || 'env';
  const claude_base_url = document.getElementById('modalBindBaseUrl').value.trim();
  const claude_api_key = document.getElementById('modalBindApiKey').value.trim();

  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    toast('请填写进程名、App ID 和 App Secret', 'error'); return;
  }
  if (claude_mode === 'custom' && (!claude_base_url || !claude_api_key)) {
    toast('自定义模式需填写 Base URL 和 API Key', 'error'); return;
  }

  const btn = document.getElementById('btnSubmitBind');
  btn.disabled = true; btn.textContent = '创建中...';

  try {
    const result = await apiPost('/api/bind', {
      process_name, feishu_app_id, feishu_app_secret, claude_mode,
      ...(claude_mode === 'custom' ? { claude_base_url, claude_api_key } : {})
    });
    if (result.code === 0) {
      toast(`✅ 绑定成功：${process_name}`, 'success');
      closeBindModal();
      refreshStatus();
    } else {
      toast(result.message || '绑定失败', 'error');
    }
  } catch (err) {
    toast('网络错误: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '创建并绑定';
  }
});

// ── 编辑绑定 Modal ──
let _editCurrentProcess = null;

async function openEditModal(processName) {
  _editCurrentProcess = processName;
  switchEditTab('modify');
  document.getElementById('editModal').classList.remove('hidden');

  // 预填当前绑定数据
  try {
    const statusRes = await apiGet('/api/status');
    const binding = (statusRes.data || []).find(b => b.process_name === processName);
    if (binding) {
      document.getElementById('editProcessName').value = processName;
      document.getElementById('editAppId').value = binding.feishu_app_id || '';
      document.getElementById('editAppSecret').value = '';
      const mode = binding.claude_mode || 'env';
      document.querySelectorAll('input[name="editClaudeMode"]').forEach(r => { r.checked = r.value === mode; });
      if (mode === 'custom') {
        document.getElementById('editCustomFields').classList.remove('hidden');
        document.getElementById('editBaseUrl').value = binding.claude_base_url || '';
        document.getElementById('editApiKey').value = '';
      } else {
        document.getElementById('editCustomFields').classList.add('hidden');
        document.getElementById('editBaseUrl').value = '';
        document.getElementById('editApiKey').value = '';
      }
    }
  } catch { /* prefill failure is non-fatal */ }

  loadUnboundSessions();
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  _editCurrentProcess = null;
}

function switchEditTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(b => b.classList.toggle('active', b.dataset.etab === tab));
  document.getElementById('editModifyForm').classList.toggle('hidden', tab !== 'modify');
  document.getElementById('editMountForm').classList.toggle('hidden', tab !== 'mount');
}

document.querySelectorAll('.modal-tab').forEach(btn => {
  btn.addEventListener('click', () => switchEditTab(btn.dataset.etab));
});

document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
document.getElementById('editModal').addEventListener('click', function(e) {
  if (e.target === this) closeEditModal();
});

document.getElementById('editModifyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const feishu_app_id = document.getElementById('editAppId').value.trim();
  const feishu_app_secret = document.getElementById('editAppSecret').value.trim();
  const claude_mode = document.querySelector('input[name="editClaudeMode"]:checked')?.value || 'env';
  const claude_base_url = document.getElementById('editBaseUrl').value.trim();
  const claude_api_key = document.getElementById('editApiKey').value.trim();

  if (claude_mode === 'custom' && !claude_base_url) {
    toast('自定义模式需填写 Base URL', 'error'); return;
  }

  const body = { process_name: _editCurrentProcess, claude_mode };
  if (feishu_app_id) body.feishu_app_id = feishu_app_id;
  if (feishu_app_secret) body.feishu_app_secret = feishu_app_secret;
  if (claude_mode === 'custom') {
    body.claude_base_url = claude_base_url;
    if (claude_api_key) body.claude_api_key = claude_api_key;
  }

  const result = await apiPost('/api/edit', body);
  if (result.code === 0) {
    toast(`已更新绑定：${_editCurrentProcess}`, 'success');
    closeEditModal(); refreshStatus();
  } else {
    toast(result.message || '编辑失败', 'error');
  }
});

document.getElementById('editMountForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const process_name = document.getElementById('mountProcess').value;
  const feishu_app_id = document.getElementById('mountAppId').value.trim();
  const feishu_app_secret = document.getElementById('mountAppSecret').value.trim();
  const claude_mode = document.querySelector('input[name="mountClaudeMode"]:checked')?.value || 'env';
  const claude_base_url = document.getElementById('mountBaseUrl').value.trim();
  const claude_api_key = document.getElementById('mountApiKey').value.trim();

  if (!process_name || !feishu_app_id || !feishu_app_secret) {
    toast('请选择进程并填写 App ID 和 App Secret', 'error'); return;
  }
  if (claude_mode === 'custom' && (!claude_base_url || !claude_api_key)) {
    toast('自定义模式需填写 Base URL 和 API Key', 'error'); return;
  }

  const result = await apiPost('/api/bind/mount', {
    process_name, feishu_app_id, feishu_app_secret, claude_mode,
    ...(claude_mode === 'custom' ? { claude_base_url, claude_api_key } : {})
  });
  if (result.code === 0) {
    toast(`挂载成功：${process_name}`, 'success');
    closeEditModal(); refreshStatus();
  } else {
    toast(result.message || '挂载失败', 'error');
  }
});

async function loadUnboundSessions() {
  try {
    const res = await apiGet('/api/sessions/unbound');
    const sessions = res.data || [];
    const sel = document.getElementById('mountProcess');
    sel.innerHTML = '<option value="">-- 选择未绑定的 CC 进程 --</option>';
    if (sessions.length === 0) {
      sel.innerHTML += '<option value="" disabled>暂无未绑定的 CC 进程</option>';
    } else {
      sessions.forEach(s => { sel.innerHTML += `<option value="${esc(s)}">${esc(s)}</option>`; });
    }
  } catch { /* ignore */ }
}

// ── 解绑 Modal ──
let _unbindTarget = null;

function openUnbindModal(processName) {
  _unbindTarget = processName;
  document.getElementById('unbindProcessName').textContent = processName;
  document.getElementById('unbindKillProcess').checked = true;
  document.getElementById('unbindModal').classList.remove('hidden');
}
function closeUnbindModal() {
  document.getElementById('unbindModal').classList.add('hidden');
  _unbindTarget = null;
}

document.getElementById('btnCancelUnbind').addEventListener('click', closeUnbindModal);
document.getElementById('unbindModal').addEventListener('click', function(e) {
  if (e.target === this) closeUnbindModal();
});

document.getElementById('btnConfirmUnbind').addEventListener('click', async () => {
  if (!_unbindTarget) return;
  const kill_process = document.getElementById('unbindKillProcess').checked;
  const result = await apiPost('/api/unbind', { process_name: _unbindTarget, kill_process });
  if (result.code === 0) {
    toast(`已解绑${kill_process ? '并停止' : ''}：${_unbindTarget}`, 'success');
    closeUnbindModal(); refreshStatus();
  } else {
    toast(result.message || '解绑失败', 'error');
  }
});

// ── 日志 ──
async function refreshLogs() {
  const container = document.getElementById('logContainer');
  if (!getToken()) return;
  try {
    const result = await apiGet('/api/logs');
    const logs = result.data || [];
    if (logs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:24px;">暂无日志</p>';
      return;
    }
    container.innerHTML = logs.map(l => {
      const levelClass = l.level === 'error' ? 'log-error' : l.level === 'warn' ? 'log-warn' : 'log-info';
      const time = l.ts ? new Date(l.ts).toLocaleTimeString('zh-CN') : '';
      const msg = l.message || l.raw || JSON.stringify(l);
      return `<div class="log-entry ${levelClass}"><span style="color:var(--text-secondary)">${time}</span> ${esc(msg)}</div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;text-align:center;padding:24px;">加载失败: ${esc(e.message)}</p>`;
  }
}

// ── 工具 ──
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
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

// ── 初始化 Claude 模式切换（三个表单） ──
setupClaudeModeToggle('bindClaudeMode', 'bindCustomFields');
setupClaudeModeToggle('editClaudeMode', 'editCustomFields');
setupClaudeModeToggle('mountClaudeMode', 'mountCustomFields');

// ── 自动轮询 ──
if (getToken()) refreshStatus();
setInterval(() => { if (getToken()) refreshStatus(); }, 5000);
