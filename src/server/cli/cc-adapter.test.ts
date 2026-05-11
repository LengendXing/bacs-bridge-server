import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import adapter from './cc-adapter.js';

describe('cc-adapter.buildStartCmd', () => {
  const session = 'cc-test';

  it('local provider 不注入任何 env，直接调用 claude', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
    });
    expect(cmd).toMatch(/^tmux new-session -d -s cc-test "/);
    expect(cmd).not.toContain('ANTHROPIC_BASE_URL');
    expect(cmd).not.toContain('ANTHROPIC_API_KEY');
    expect(cmd).not.toContain('ANTHROPIC_AUTH_TOKEN');
    expect(cmd).not.toContain('-u CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('custom provider 同时注入 API_KEY 和 AUTH_TOKEN，并 unset 远程 OAuth 凭据', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_API_KEY: 'sk-test-123',
        ANTHROPIC_AUTH_TOKEN: 'sk-test-123',
      },
    });
    expect(cmd).toContain("ANTHROPIC_BASE_URL='https://api.example.com'");
    expect(cmd).toContain("ANTHROPIC_API_KEY='sk-test-123'");
    expect(cmd).toContain("ANTHROPIC_AUTH_TOKEN='sk-test-123'");
    expect(cmd).toContain('-u CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('custom provider 不再产生 ANTHROPIC_AUTH_TOKEN= 这种把 token 清空的语句', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_API_KEY: 'sk-test-123',
      },
    });
    // 不允许出现把 AUTH_TOKEN 显式清空的形式 `ANTHROPIC_AUTH_TOKEN=' '` 或 `ANTHROPIC_AUTH_TOKEN= claude`
    expect(cmd).not.toMatch(/ANTHROPIC_AUTH_TOKEN=(?:\s|"|$)/);
  });

  it('custom provider 仅给 API_KEY 时，fallback 把它同时注入到 AUTH_TOKEN', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_API_KEY: 'sk-only-api-key',
      },
    });
    expect(cmd).toContain("ANTHROPIC_API_KEY='sk-only-api-key'");
    expect(cmd).toContain("ANTHROPIC_AUTH_TOKEN='sk-only-api-key'");
  });

  it('包含单引号的 baseUrl/key 被安全转义', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: "https://a'b.com",
        ANTHROPIC_API_KEY: "key'with'quote",
      },
    });
    expect(cmd).toContain(`ANTHROPIC_BASE_URL='https://a'\\''b.com'`);
    expect(cmd).toContain(`ANTHROPIC_API_KEY='key'\\''with'\\''quote'`);
  });

  it('指定 modelId 会注入 ANTHROPIC_MODEL 并加 --model 参数', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'claude-sonnet-4-20250514',
    });
    expect(cmd).toContain("ANTHROPIC_MODEL='claude-sonnet-4-20250514'");
    expect(cmd).toContain("--model 'claude-sonnet-4-20250514'");
  });

  describe('CLAUDE_BIN 解析', () => {
    let originalBin: string | undefined;
    beforeEach(() => { originalBin = process.env.CLAUDE_BIN; });
    afterEach(() => {
      if (originalBin === undefined) delete process.env.CLAUDE_BIN;
      else process.env.CLAUDE_BIN = originalBin;
    });

    it('未设置 CLAUDE_BIN 时使用裸 `claude`，不拼接本地 HOME 路径', async () => {
      // 由于 CLAUDE_BIN 在模块顶层求值，这里只能间接断言：当前模块下的输出
      // 包含 `claude` 命令名，且不应包含 `/Users/` 或 `.local/bin/claude` 这种本地路径片段
      const cmd = adapter.buildStartCmd('cc-bin', { providerKind: 'local', envVars: {} });
      expect(cmd).toContain('claude');
      expect(cmd).not.toMatch(/\/Users\/[^/]+\/\.local\/bin\/claude/);
    });
  });
});

describe('cc-adapter.extractReply', () => {
  it('保留本轮回复——空闲光标 + ? for shortcuts 不应丢失内容', () => {
    const pane = `╭─── Claude Code v2.1.126 ───╮
│  Welcome back!             │
╰────────────────────────────╯

❯ 现在几点了

● 现在是 2026 年 5 月 11 日下午 5 点 03 分（北京时间）。

╭────────────────────────────╮
│ ❯                          │
╰────────────────────────────╯
  ? for shortcuts
`;
    const reply = adapter.extractReply(pane, '现在几点了');
    expect(reply).not.toBe('');
    expect(reply).toContain('2026 年 5 月 11 日');
    expect(reply).not.toContain('? for shortcuts');
    expect(reply).not.toMatch(/❯/);
  });

  it('多轮历史短消息——只返回本轮回复，不混入历史', () => {
    const pane = `❯ 你好
● 你好！有什么可以帮你？
❯ 现在几点了
● 现在是 2026/05/11 17:03。
╭───╮
│ ❯ │
╰───╯
  ? for shortcuts
`;
    const reply = adapter.extractReply(pane, '现在几点了');
    expect(reply).toContain('2026/05/11 17:03');
    expect(reply).not.toContain('你好！有什么可以帮你');
  });

  it('被边框包裹的空闲光标 `│ ❯ │` 也应识别为光标行', () => {
    const pane = `❯ 测试
● 答案内容。
╭───╮
│ ❯ │
╰───╯
`;
    const reply = adapter.extractReply(pane, '测试');
    expect(reply).toBe('答案内容。');
  });

  it('长回复多行——保留所有行', () => {
    const pane = `❯ 解释一下事件循环
● 事件循环是 Node.js 的核心机制...
  这是第二行。
╭───╮
│ ❯ │
╰───╯
  ? for shortcuts
`;
    const reply = adapter.extractReply(pane, '解释一下事件循环');
    expect(reply).toContain('事件循环是 Node.js 的核心机制');
    expect(reply).toContain('这是第二行');
  });

  it('raw 为空字符串——返回空（由调用方走"未能提取"分支）', () => {
    expect(adapter.extractReply('', '任意')).toBe('');
  });

  it('完全没有 `●` 块且没有可识别内容时——至少返回非空兜底（避免飞书显示"未能提取"）', () => {
    const pane = `这是一段非典型输出
没有 bullet 标记
也没有 prompt 标记
`;
    const reply = adapter.extractReply(pane, 'q');
    expect(reply).not.toBe('');
  });
});
