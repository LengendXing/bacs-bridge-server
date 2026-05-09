const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bindings.json');

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ bindings: [] }, null, 2), 'utf-8');
}

function read() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function write(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function getAll() {
  return read().bindings;
}

function getByProcess(processName) {
  return read().bindings.find(b => b.process_name === processName);
}

function getByAppId(appId) {
  return read().bindings.find(b => b.feishu_app_id === appId);
}

function create({ process_name, feishu_app_id, feishu_app_secret, claude_mode, claude_base_url, claude_api_key }) {
  const data = read();
  const existing = data.bindings.find(
    b => b.process_name === process_name || b.feishu_app_id === feishu_app_id
  );
  if (existing) {
    return { error: '进程或飞书应用已绑定', existing };
  }

  const binding = {
    id: uuidv4(),
    process_name,
    feishu_app_id,
    feishu_app_secret,
    claude_mode: claude_mode || 'env',          // 'env' | 'custom'
    claude_base_url: claude_base_url || null,    // custom 模式才有值
    claude_api_key: claude_api_key || null,      // custom 模式才有值
    created_at: new Date().toISOString(),
    status: 'online'
  };

  data.bindings.push(binding);
  write(data);
  return { binding };
}

// 编辑绑定（进程名不可改，作为主键）
function edit(processName, updates) {
  const data = read();
  const idx = data.bindings.findIndex(b => b.process_name === processName);
  if (idx === -1) return { error: '绑定不存在' };

  const binding = data.bindings[idx];

  // 允许更新的字段
  const allowed = ['feishu_app_id', 'feishu_app_secret', 'claude_mode', 'claude_base_url', 'claude_api_key', 'status'];
  for (const key of allowed) {
    if (key in updates) {
      binding[key] = updates[key];
    }
  }

  // 清理 env 模式下的自定义字段
  if (binding.claude_mode === 'env') {
    binding.claude_base_url = null;
    binding.claude_api_key = null;
  }

  data.bindings[idx] = binding;
  write(data);
  return { binding };
}

function remove(processName) {
  const data = read();
  const idx = data.bindings.findIndex(b => b.process_name === processName);
  if (idx === -1) return { error: '绑定不存在' };

  const removed = data.bindings.splice(idx, 1)[0];
  write(data);
  return { binding: removed };
}

function updateStatus(processName, status) {
  const data = read();
  const binding = data.bindings.find(b => b.process_name === processName);
  if (!binding) return { error: '绑定不存在' };

  binding.status = status;
  write(data);
  return { binding };
}

module.exports = { getAll, getByProcess, getByAppId, create, edit, remove, updateStatus };
