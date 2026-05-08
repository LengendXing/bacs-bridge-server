const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_FILE = path.join(__dirname, '..', '..', 'data', 'bindings.json');

function read() {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  return JSON.parse(raw);
}

function write(data) {
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

function create({ process_name, feishu_app_id, feishu_app_secret }) {
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
    created_at: new Date().toISOString(),
    status: 'online'
  };

  data.bindings.push(binding);
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

module.exports = { getAll, getByProcess, getByAppId, create, remove, updateStatus };
