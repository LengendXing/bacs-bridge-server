import { Client } from 'ssh2';
import logger from '../middleware/logger.js';
export class SshExecutor {
    kind = 'ssh';
    machineId;
    config;
    pool;
    IDLE_TIMEOUT = 60_000;
    HEARTBEAT_INTERVAL = 300_000;
    CONNECT_TIMEOUT = 10_000;
    EXEC_TIMEOUT = 15_000;
    constructor(machineId, config) {
        this.machineId = machineId;
        this.config = config;
        this.pool = {
            client: new Client(),
            state: 'disconnected',
            lastUsed: 0,
            idleTimer: null,
            heartbeatTimer: null,
            connectPromise: null,
        };
    }
    async ensureConnected() {
        if (this.pool.state === 'connected')
            return this.pool.client;
        if (this.pool.connectPromise) {
            await this.pool.connectPromise;
            return this.pool.client;
        }
        this.pool.connectPromise = this._connect();
        try {
            await this.pool.connectPromise;
        }
        finally {
            this.pool.connectPromise = null;
        }
        return this.pool.client;
    }
    _connect() {
        return new Promise((resolve, reject) => {
            try {
                this.pool.client.destroy();
            }
            catch { /* */ }
            this.pool.client = new Client();
            this.pool.state = 'connecting';
            const connectCfg = {
                host: this.config.host,
                port: this.config.port,
                username: this.config.username,
                readyTimeout: this.config.readyTimeout ?? this.CONNECT_TIMEOUT,
                keepaliveInterval: 30_000,
                keepaliveCountMax: 3,
            };
            if (this.config.privateKey) {
                connectCfg.privateKey = this.config.privateKey;
                if (this.config.passphrase)
                    connectCfg.passphrase = this.config.passphrase;
            }
            else if (this.config.password) {
                connectCfg.password = this.config.password;
            }
            this.pool.client
                .on('ready', () => {
                this.pool.state = 'connected';
                this.pool.lastUsed = Date.now();
                this.startIdleTimer();
                this.startHeartbeat();
                logger.log('info', `SSH 连接建立: machine=${this.machineId} host=${this.config.host}`);
                resolve();
            })
                .on('error', (err) => {
                this.pool.state = 'error';
                logger.log('error', `SSH 连接错误: machine=${this.machineId}`, err.message);
                reject(err);
            })
                .on('close', () => {
                const wasConnected = this.pool.state === 'connected';
                this.pool.state = 'disconnected';
                this.stopIdleTimer();
                this.stopHeartbeat();
                if (wasConnected) {
                    logger.log('info', `SSH 连接断开: machine=${this.machineId}`);
                }
            })
                .on('end', () => {
                this.pool.state = 'disconnected';
                this.stopIdleTimer();
                this.stopHeartbeat();
            })
                .connect(connectCfg);
        });
    }
    startIdleTimer() {
        this.stopIdleTimer();
        this.pool.idleTimer = setTimeout(() => {
            const idle = Date.now() - this.pool.lastUsed;
            if (idle >= this.IDLE_TIMEOUT && this.pool.state === 'connected') {
                logger.log('info', `SSH 空闲断开: machine=${this.machineId}`);
                this.pool.client.end();
            }
        }, this.IDLE_TIMEOUT);
    }
    stopIdleTimer() {
        if (this.pool.idleTimer) {
            clearTimeout(this.pool.idleTimer);
            this.pool.idleTimer = null;
        }
    }
    startHeartbeat() {
        this.stopHeartbeat();
        this.pool.heartbeatTimer = setInterval(async () => {
            if (this.pool.state !== 'connected')
                return;
            try {
                const r = await this.exec('echo __heartbeat__', { timeout: 5000 });
                if (!r.ok) {
                    logger.log('warn', `SSH 心跳失败: machine=${this.machineId}`, r.error);
                }
            }
            catch {
                logger.log('warn', `SSH 心跳异常: machine=${this.machineId}`);
            }
        }, this.HEARTBEAT_INTERVAL);
    }
    stopHeartbeat() {
        if (this.pool.heartbeatTimer) {
            clearInterval(this.pool.heartbeatTimer);
            this.pool.heartbeatTimer = null;
        }
    }
    async exec(cmd, options) {
        try {
            const client = await this.ensureConnected();
            this.pool.lastUsed = Date.now();
            this.startIdleTimer();
            return await new Promise((resolve) => {
                const timeout = options?.timeout ?? this.EXEC_TIMEOUT;
                let settled = false;
                const timer = setTimeout(() => {
                    if (!settled) {
                        settled = true;
                        resolve({ stdout: '', stderr: '', exitCode: null, ok: false, error: `命令执行超时 (${timeout}ms): ${cmd.slice(0, 100)}` });
                    }
                }, timeout);
                client.exec(cmd, (err, stream) => {
                    if (err) {
                        clearTimeout(timer);
                        if (!settled) {
                            settled = true;
                            resolve({ stdout: '', stderr: '', exitCode: null, ok: false, error: `SSH exec 错误: ${err.message}` });
                        }
                        return;
                    }
                    let stdout = '';
                    let stderr = '';
                    stream
                        .on('data', (data) => { stdout += data.toString('utf-8'); })
                        .on('error', (e) => {
                        clearTimeout(timer);
                        if (!settled) {
                            settled = true;
                            resolve({ stdout, stderr, exitCode: null, ok: false, error: e.message });
                        }
                    });
                    stream.stderr?.on('data', (data) => { stderr += data.toString('utf-8'); });
                    stream.on('close', (code) => {
                        clearTimeout(timer);
                        if (!settled) {
                            settled = true;
                            resolve({ stdout, stderr, exitCode: code, ok: code === 0 });
                        }
                    });
                });
            });
        }
        catch (e) {
            return { stdout: '', stderr: '', exitCode: null, ok: false, error: `SSH 连接失败: ${e.message}` };
        }
    }
    async sessionExists(sessionName) {
        const r = await this.exec(`tmux has-session -t ${sessionName} 2>/dev/null`, { timeout: 5000 });
        return r.ok;
    }
    async listSessionsByPrefix(prefix) {
        const r = await this.exec('tmux list-sessions 2>/dev/null');
        if (!r.ok)
            return [];
        const sessions = [];
        for (const line of r.stdout.split('\n')) {
            const m = line.match(new RegExp(`^${prefix}-([^:]+):`));
            if (m)
                sessions.push(m[1]);
        }
        return sessions;
    }
    async capturePane(sessionName, lines = 500) {
        const r = await this.exec(`tmux capture-pane -t ${sessionName} -p -S -${lines}`, { timeout: 15000 });
        if (!r.ok)
            return { output: '', error: r.error };
        return { output: r.stdout };
    }
    async sendInput(sessionName, text) {
        const exists = await this.sessionExists(sessionName);
        if (!exists)
            return { ok: false, error: `会话 ${sessionName} 不在线` };
        try {
            const b64 = Buffer.from(text, 'utf-8').toString('base64');
            const loadResult = await this.exec(`echo ${b64} | base64 -d | tmux load-buffer -b cli_in -`);
            if (!loadResult.ok)
                return { ok: false, error: `load-buffer 失败: ${loadResult.error}` };
            const pasteResult = await this.exec(`tmux paste-buffer -b cli_in -t ${sessionName}`);
            if (!pasteResult.ok)
                return { ok: false, error: `paste-buffer 失败: ${pasteResult.error}` };
            await this.exec(`tmux delete-buffer -b cli_in 2>/dev/null || true`);
            await this.exec(`tmux send-keys -t ${sessionName} Enter`);
            return { ok: true };
        }
        catch (e) {
            return { ok: false, error: `send-keys 失败: ${e.message}` };
        }
    }
    async killSession(sessionName) {
        await this.exec(`tmux kill-session -t ${sessionName} 2>/dev/null || true`);
    }
    async testConnection() {
        const start = Date.now();
        try {
            const r = await this.exec('echo ok', { timeout: 5000 });
            const latency = Date.now() - start;
            if (r.ok)
                return { ok: true, latencyMs: latency };
            return { ok: false, latencyMs: latency, error: r.error };
        }
        catch (e) {
            return { ok: false, latencyMs: Date.now() - start, error: e.message };
        }
    }
    async dispose() {
        this.stopIdleTimer();
        this.stopHeartbeat();
        try {
            this.pool.client.end();
            this.pool.client.destroy();
        }
        catch { /* */ }
        this.pool.state = 'disconnected';
    }
}
