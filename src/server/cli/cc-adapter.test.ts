import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import adapter from './cc-adapter.js';

describe('cc-adapter.buildStartCmd', () => {
  const session = 'cc-test';

  it('使用 bash -ilc 包裹以加载远程 rc 文件（绕过 [ -z "$PS1" ] && return 守卫）', () => {
    const cmd = adapter.buildStartCmd(session, { providerKind: 'local', envVars: {} });
    expect(cmd).toMatch(/^tmux new-session -d -s cc-test "bash -ilc '/);
    expect(cmd).toContain('exec claude');
  });

  it('local provider 不注入任何 ANTHROPIC_* env，让远程 rc 的配置自然生效', () => {
    const cmd = adapter.buildStartCmd(session, { providerKind: 'local', envVars: {} });
    expect(cmd).not.toContain('ANTHROPIC_BASE_URL');
    expect(cmd).not.toContain('ANTHROPIC_API_KEY');
    expect(cmd).not.toContain('ANTHROPIC_AUTH_TOKEN');
    expect(cmd).not.toContain('unset CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('custom provider 注入 BASE_URL + AUTH_TOKEN，并 unset 远程 OAuth 凭据', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_AUTH_TOKEN: 'sk-test-123',
      },
    });
    // bash -ilc '...' 外层包裹，内层每个 'value' 被转义为 '\''value'\''
    expect(cmd).toContain("unset CLAUDE_CODE_OAUTH_TOKEN");
    expect(cmd).toContain("export ANTHROPIC_BASE_URL='\\''https://api.example.com'\\''");
    expect(cmd).toContain("export ANTHROPIC_AUTH_TOKEN='\\''sk-test-123'\\''");
  });

  it('custom provider 必须不注入 ANTHROPIC_API_KEY（否则 CLI 弹出确认页阻塞 tmux）', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_API_KEY: 'sk-test-123',
        ANTHROPIC_AUTH_TOKEN: 'sk-test-123',
      },
    });
    expect(cmd).not.toContain('ANTHROPIC_API_KEY');
  });

  it('custom provider 仅给 API_KEY 时 fallback 注入到 AUTH_TOKEN', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: 'https://api.example.com',
        ANTHROPIC_API_KEY: 'sk-only-api-key',
      },
    });
    expect(cmd).toContain("export ANTHROPIC_AUTH_TOKEN='\\''sk-only-api-key'\\''");
    expect(cmd).not.toContain('export ANTHROPIC_API_KEY');
  });

  it('值中含单引号时，命令能在 shell 中正确还原原始值', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        ANTHROPIC_BASE_URL: "https://a'b.com",
        ANTHROPIC_AUTH_TOKEN: "key'with'quote",
      },
    });
    // 不硬编码转义后的字面量（容易漂移），而是断言关键片段都出现且整段以 tmux + bash -ilc 开头
    expect(cmd).toMatch(/^tmux new-session -d -s cc-test "bash -ilc '/);
    expect(cmd).toContain('https://a');
    expect(cmd).toContain('b.com');
    expect(cmd).toContain('key');
    expect(cmd).toContain('with');
    expect(cmd).toContain('quote');
    // 不应出现未闭合的单引号导致脚本被截断
    expect(cmd).toContain('exec claude');
  });

  it('指定 modelId 会 export ANTHROPIC_MODEL 并加 --model 参数', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'claude-sonnet-4-20250514',
    });
    expect(cmd).toContain("export ANTHROPIC_MODEL='\\''claude-sonnet-4-20250514'\\''");
    expect(cmd).toContain("exec claude --model '\\''claude-sonnet-4-20250514'\\''");
  });

  it('使用 exec 替换 bash 进程（避免父 bash 残留）', () => {
    const cmd = adapter.buildStartCmd(session, { providerKind: 'local', envVars: {} });
    expect(cmd).toMatch(/exec claude'?"$/);
  });

  it('指定 effort 时拼入 --effort 参数', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'claude-opus-4-7',
      effort: 'max',
    });
    expect(cmd).toContain("--effort '\\''max'\\''");
    expect(cmd).toContain("--model '\\''claude-opus-4-7'\\''");
  });

  it('不指定 effort 时不应出现 --effort', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'claude-haiku-4-5-20251001',
    });
    expect(cmd).not.toContain('--effort');
  });

  it('未设置 CLAUDE_BIN 时使用裸 `claude`，不拼接本地 HOME 路径', () => {
    const cmd = adapter.buildStartCmd('cc-bin', { providerKind: 'local', envVars: {} });
    expect(cmd).toContain('claude');
    expect(cmd).not.toMatch(/\/Users\/[^/]+\/\.local\/bin\/claude/);
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

describe('cc-adapter.sendChoice', () => {
  function makeExecutor() {
    const calls: { keys: string[]; betweenMs?: number }[] = [];
    return {
      calls,
      executor: {
        kind: 'local' as const,
        machineId: null,
        async exec() { return { stdout: '', stderr: '', exitCode: 0, ok: true }; },
        async sessionExists() { return true; },
        async listSessionsByPrefix() { return []; },
        async capturePane() { return { output: '' }; },
        async sendInput() { return { ok: true }; },
        async sendKeys(_session: string, keys: string[], betweenMs?: number) {
          calls.push({ keys, betweenMs });
          return { ok: true };
        },
        async killSession() {},
      },
    };
  }

  const panelYesNo = {
    title: 'Do you want to use this API key?',
    options: ['1. Yes', '2. No (recommended)'],
    defaultIndex: 1,
  };

  it('用户回复"1" → 已在默认项 → 直接 C-m', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '1', panelYesNo, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['C-m']);
  });

  it('用户回复"2" → 默认在 1，按 1 次 Down + C-m', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '2', panelYesNo, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(2);
    expect(calls[0].keys).toEqual(['Down', 'C-m']);
  });

  it('用户回复"yes"/"是" → 选第 1 项', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', 'yes', panelYesNo, executor);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['C-m']);

    const ex2 = makeExecutor();
    const r2 = await adapter.sendChoice('cc-test', '是', panelYesNo, ex2.executor);
    expect(r2.chosenIndex).toBe(1);
  });

  it('用户回复"no"/"否" → 选 No（第 2 项）', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', 'no', panelYesNo, executor);
    expect(r.chosenIndex).toBe(2);
    expect(calls[0].keys).toEqual(['Down', 'C-m']);
  });

  it('用户回复无法识别 → ok:false 提示重试', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '不知道选啥', panelYesNo, executor);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('从默认 2 移动到 3 → 1 次 Down + C-m', async () => {
    const { calls, executor } = makeExecutor();
    const panel3 = {
      title: 'Pick',
      options: ['1. A', '2. B', '3. C'],
      defaultIndex: 2,
    };
    const r = await adapter.sendChoice('cc-test', '3', panel3, executor);
    expect(r.chosenIndex).toBe(3);
    expect(calls[0].keys).toEqual(['Down', 'C-m']);
  });

  it('从默认 3 移动到 1 → 2 次 Up + C-m', async () => {
    const { calls, executor } = makeExecutor();
    const panel3 = {
      title: 'Pick',
      options: ['1. A', '2. B', '3. C'],
      defaultIndex: 3,
    };
    const r = await adapter.sendChoice('cc-test', '1', panel3, executor);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['Up', 'Up', 'C-m']);
  });

  it('defaultIndex=0（未识别） → 回退用数字键 + C-m', async () => {
    const { calls, executor } = makeExecutor();
    const panel = {
      title: 'Pick',
      options: ['1. A', '2. B'],
      defaultIndex: 0,
    };
    const r = await adapter.sendChoice('cc-test', '2', panel, executor);
    expect(r.chosenIndex).toBe(2);
    expect(calls[0].keys).toEqual(['2', 'C-m']);
  });
});

describe('cc-adapter.extractChoicePanel', () => {
  it('识别标准 Yes/No 决策面板（带 ❯ 标记当前高亮项）', () => {
    const pane = `● Reading file...
╭────────────────────────────────────────╮
│ Do you want to use this API key?       │
│                                        │
│ ❯ 1. Yes                               │
│   2. No (recommended)                  │
╰────────────────────────────────────────╯
`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Do you want to use this API key/);
    expect(panel!.options).toHaveLength(2);
    expect(panel!.options[0]).toMatch(/^1\..*Yes/);
    expect(panel!.options[1]).toMatch(/^2\..*No \(recommended\)/);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别 3 个选项的工具调用确认面板，defaultIndex 跟随 ❯', () => {
    const pane = `╭──────────────────────────────────╮
│ Allow Bash command "rm -rf /"?  │
│                                  │
│   1. Yes, once                   │
│ ❯ 2. Yes, allow this session     │
│   3. No                          │
╰──────────────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(3);
    expect(panel!.defaultIndex).toBe(2);
  });

  it('普通输入框（│ ❯ │）不应被识别为决策面板（选项数 < 2）', () => {
    const pane = `● 答案。
╭───╮
│ ❯ │
╰───╯
  ? for shortcuts`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).toBeNull();
  });

  it('普通回复中无任何框 → 返回 null', () => {
    expect(adapter.extractChoicePanel('hello world\nno panel here')).toBeNull();
  });

  it('空输入 → 返回 null', () => {
    expect(adapter.extractChoicePanel('')).toBeNull();
  });
});
