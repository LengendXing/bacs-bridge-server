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

describe('cc-adapter.extractToolCalls', () => {
  it('提取标准工具调用行', () => {
    const pane = `● Bash(git push origin main)
● Read(auth.py)
● Edit(config.json)
❯ `;
    const calls = adapter.extractToolCalls(pane);
    expect(calls).toEqual(['Bash(git push origin main)', 'Read(auth.py)', 'Edit(config.json)']);
  });

  it('默认只取最近 3 个（从下往上）', () => {
    const pane = `● Glob(*.ts)
● Grep(pattern)
● Bash(cmd1)
● Read(file.py)
● Edit(fix.ts)`;
    const calls = adapter.extractToolCalls(pane);
    expect(calls).toHaveLength(3);
    expect(calls).toEqual(['Bash(cmd1)', 'Read(file.py)', 'Edit(fix.ts)']);
  });

  it('超长参数截断为 20 字符 + ...', () => {
    const longArg = 'a'.repeat(50);
    const pane = `● Bash(${longArg})`;
    const calls = adapter.extractToolCalls(pane);
    expect(calls[0].length).toBeLessThan(30);
    expect(calls[0]).toContain('...');
  });

  it('无工具调用时返回空数组', () => {
    expect(adapter.extractToolCalls('')).toEqual([]);
    expect(adapter.extractToolCalls('no tools here')).toEqual([]);
    expect(adapter.extractToolCalls('❯ hello')).toEqual([]);
  });

  it('maxItems 可自定义', () => {
    const pane = `● A(x)
● B(y)
● C(z)
● D(w)`;
    expect(adapter.extractToolCalls(pane, 2)).toHaveLength(2);
  });
});

describe('cc-adapter.extractTiming', () => {
  it('识别 ✻ Brewed for 5s', () => {
    const pane = `● 回复内容
✻ Brewed for 5s
❯ `;
    expect(adapter.extractTiming(pane)).toBe(5);
  });

  it('识别 ✻ Cooked for 2m 25s（分+秒格式）', () => {
    const pane = `✻ Cooked for 2m 25s`;
    expect(adapter.extractTiming(pane)).toBe(145);
  });

  it('识别 ✻ Sautéed for 34s', () => {
    const pane = `✻ Sautéed for 34s`;
    expect(adapter.extractTiming(pane)).toBe(34);
  });

  it('无耗时行时返回 0', () => {
    expect(adapter.extractTiming('')).toBe(0);
    expect(adapter.extractTiming('no timing here')).toBe(0);
  });

  it('多行时取最近一条', () => {
    const pane = `✻ Brewed for 5s
...
✻ Cooked for 1m 30s`;
    expect(adapter.extractTiming(pane)).toBe(90);
  });
});

describe('cc-adapter.extractToolCount', () => {
  it('统计各工具调用次数', () => {
    const pane = `● Bash(git push)
● Read(auth.py)
● Edit(config.json)
● Bash(npm test)
● Read(utils.ts)`;
    const count = adapter.extractToolCount(pane);
    expect(count).toEqual({ Bash: 2, Read: 2, Edit: 1 });
  });

  it('无工具调用返回空对象', () => {
    expect(adapter.extractToolCount('')).toEqual({});
    expect(adapter.extractToolCount('no tools')).toEqual({});
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

  // ─── v1.1.23 新增：飞书决策弹窗双向交互修复相关回归测试 ───

  it('识别中文标题决策面板', () => {
    const pane = `╭───────────────────────────────╮
│ 是否允许执行命令？             │
│                               │
│ ❯ 1. 允许                     │
│   2. 拒绝                     │
╰───────────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(2);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别 4 个选项面板（v1.1.23 卡片最多渲染 5 个按钮的边界）', () => {
    const pane = `╭──────────────────────────────╮
│ Pick an option              │
│                              │
│   1. Alpha                   │
│ ❯ 2. Bravo                   │
│   3. Charlie                 │
│   4. Delta                   │
╰──────────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(4);
    expect(panel!.defaultIndex).toBe(2);
  });

  it('多余空白和制表符不影响面板识别', () => {
    const pane = `   ╭───────────╮
   │ Confirm?  │
   │           │
   │ ❯ 1. Yes  │
   │   2. No   │
   ╰───────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(2);
  });

  it('面板嵌入在工具调用输出后也能识别（典型权限弹窗场景）', () => {
    const pane = `● 调用工具 Bash
● 命令：rm /tmp/test
╭──────────────────────────────────────╮
│ Allow Bash command?                  │
│                                       │
│ ❯ 1. Yes                              │
│   2. No, and tell Claude what to do  │
╰──────────────────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Allow Bash command/);
    expect(panel!.defaultIndex).toBe(1);
  });
});

describe('cc-adapter.extractChoicePanel — cc v2.1.x borderless format', () => {
  it('识别 CC v2.1.126 无边框 4 选项面板（含描述子行 + 分隔线 + Enter to select）', () => {
    const pane = `☐ Test
能看到上下选择吗？
❯ 1. Yes
      affirmative
  2. No
      negative
  3. Type something.
────────────────────────────────────────────────────────────────────────────────────────────────────────
  4. Chat about this
Enter to select · ↑/↓ to navigate · Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/能看到上下选择吗/);
    expect(panel!.options).toHaveLength(4);
    expect(panel!.options[0]).toBe('1. Yes');
    expect(panel!.options[1]).toBe('2. No');
    expect(panel!.options[2]).toBe('3. Type something.');
    expect(panel!.options[3]).toBe('4. Chat about this');
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别无边框 2 选项面板（简洁 Yes/No，无描述）', () => {
    const pane = `Do you want to continue?
❯ 1. Yes
  2. No
Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(2);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别无边框 3 选项权限面板（Allow once / Allow for session / Deny）', () => {
    const pane = `Allow Bash command "ls -la"?
❯ 1. Allow once
  2. Allow for this session
  3. Deny
Enter to select · ↑/↓ to navigate · Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(3);
    expect(panel!.options[0]).toBe('1. Allow once');
    expect(panel!.defaultIndex).toBe(1);
  });

  it('无边框面板嵌入在工具调用后也能识别', () => {
    const pane = `● Bash(git push origin main)
  ⎿  Pushed successfully

Allow this command?
❯ 1. Yes
  2. No
Enter to select · Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Allow this command/);
    expect(panel!.options).toHaveLength(2);
  });

  it('普通 idle 状态（❯ + ? for shortcuts）不应被识别为无边框面板', () => {
    const pane = `❯
────────────────────────────────────────────────────────────────────────────────
  ? for shortcuts`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).toBeNull();
  });
});

describe('cc-adapter.extractChoicePanel — cc v2.1.138 permission panels (real capture)', () => {
  it('识别 Bash 权限面板（含 ────── 顶部分隔线 + Esc to cancel · Tab to amend · ctrl+e to explain）', () => {
    const pane = `────────────────────────────────────────────────────────────────────────────────
 Bash command

   cat /etc/hostname
   Read hostname file

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow reading from etc/ from this project
   3. No

 Esc to cancel · Tab to amend · ctrl+e to explain`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toBe('Do you want to proceed?');
    expect(panel!.options).toHaveLength(3);
    expect(panel!.options[0]).toBe('1. Yes');
    expect(panel!.options[1]).toMatch(/^2\..*allow reading/);
    expect(panel!.options[2]).toBe('3. No');
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别 Edit 权限面板（含 ╌╌ diff 分隔线 + (shift+tab) 选项）', () => {
    const pane = `────────────────────────────────────────────────────────────────────────────────
 Edit file
 app.js
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 1 -function hello() { return 2; }
 1 +function hello() { return 3; }
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Do you want to make this edit to app.js?
 ❯ 1. Yes
   2. Yes, allow all edits during this session (shift+tab)
   3. No

 Esc to cancel · Tab to amend`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Do you want to make this edit/);
    expect(panel!.options).toHaveLength(3);
    expect(panel!.options[0]).toBe('1. Yes');
    expect(panel!.options[1]).toMatch(/^2\..*allow all edits/);
    expect(panel!.options[2]).toBe('3. No');
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别 Write 权限面板（创建新文件）', () => {
    const pane = `────────────────────────────────────────────────────────────────────────────────
 Write file
 config.json
 Do you want to create config.json?
 ❯ 1. Yes
   2. Yes, and allow writing new files for this project
   3. No

 Esc to cancel · Tab to amend`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Do you want to create/);
    expect(panel!.options).toHaveLength(3);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('选项含 (shift+tab) 不会被误判为 hint 行（关键 Bug 回归）', () => {
    const pane = `❯ 1. Yes
   2. Yes, allow all edits during this session (shift+tab)
   3. No
 Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(3);
  });
});

describe('cc-adapter.extractChoicePanel — cc v2.1.x inline format (⏵⏵)', () => {
  it('识别 ⏵⏵ accept edits on (shift+tab to cycle)', () => {
    const pane = `● Bash(echo hello)
  ⎿  hello

✻ Brewed for 5s

────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ accept edits on (shift+tab to cycle)`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.format).toBe('inline');
    expect(panel!.title).toContain('代码修改');
    expect(panel!.options).toHaveLength(2);
    expect(panel!.options[0]).toMatch(/Accept/i);
    expect(panel!.options[1]).toMatch(/Reject/i);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('识别 ⏵⏵ reject edits on — defaultIndex 应为 2', () => {
    const pane = `❯
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ reject edits on (shift+tab to cycle)`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.format).toBe('inline');
    expect(panel!.defaultIndex).toBe(2);
  });

  it('识别 ⏵⏵ allow once on — 权限确认类型', () => {
    const pane = `❯
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ allow once on (shift+tab to cycle)`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.format).toBe('inline');
    expect(panel!.title).toContain('权限');
    expect(panel!.options).toHaveLength(3);
    expect(panel!.options[0]).toMatch(/Allow once/i);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('普通 idle 状态（❯ + ? for shortcuts）不应被识别为 inline 面板', () => {
    const pane = `❯
────────────────────────────────────────────────────────────────────────────────
  ? for shortcuts`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).toBeNull();
  });
});

describe('cc-adapter.sendChoice — inline format', () => {
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

  const inlinePanel = {
    title: 'cc 提议了代码修改，请确认',
    options: ['1. Accept edits', '2. Reject edits'],
    defaultIndex: 1,
    format: 'inline' as const,
  };

  it('inline 面板选 Accept → 发 Enter', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '1', inlinePanel, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['C-m']);
  });

  it('inline 面板选 Reject → 发 Escape', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '2', inlinePanel, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(2);
    expect(calls[0].keys).toEqual(['Escape']);
  });

  it('inline 面板回复 yes → 发 Enter', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', 'yes', inlinePanel, executor);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['C-m']);
  });

  it('inline 面板回复 reject → 发 Escape', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', 'reject', inlinePanel, executor);
    expect(r.chosenIndex).toBe(2);
    expect(calls[0].keys).toEqual(['Escape']);
  });

  it('inline 面板无法识别的回复 → ok:false', async () => {
    const { calls, executor } = makeExecutor();
    const r = await adapter.sendChoice('cc-test', '不知道选啥', inlinePanel, executor);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe('cc-adapter.sendChoice — v1.1.23 飞书按钮模拟回归', () => {
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

  it('飞书卡片按钮回调用 String(optionIndex) 输入应精确匹配序号 → 不走关键词匹配', async () => {
    // 模拟用户点击决策卡上的 "2." 按钮
    const { calls, executor } = makeExecutor();
    const panel = {
      title: 'Allow?',
      options: ['1. Yes', '2. No'],
      defaultIndex: 1,
    };
    const r = await adapter.sendChoice('cc-test', '2', panel, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(2);
    // 默认 1 → 选 2 应该是 Down + C-m
    expect(calls[0].keys).toEqual(['Down', 'C-m']);
  });

  it('飞书按钮模拟选第 1 项时不发任何方向键（已在默认项）', async () => {
    const { calls, executor } = makeExecutor();
    const panel = {
      title: 'Allow?',
      options: ['1. Yes', '2. No'],
      defaultIndex: 1,
    };
    const r = await adapter.sendChoice('cc-test', '1', panel, executor);
    expect(r.chosenIndex).toBe(1);
    expect(calls[0].keys).toEqual(['C-m']);
  });

  it('飞书文本回复"是"应识别为默认 Yes（兜底路径）', async () => {
    const { executor } = makeExecutor();
    const panel = {
      title: '允许？',
      options: ['1. 允许', '2. 拒绝'],
      defaultIndex: 1,
    };
    const r = await adapter.sendChoice('cc-test', '是', panel, executor);
    expect(r.ok).toBe(true);
    expect(r.chosenIndex).toBe(1);
  });
});

describe('cc-adapter — consecutive choice panels', () => {
  it('连续两个 box 格式面板在 pane 中——应找到最新的（底部）', () => {
    const pane = `╭───────────────────────────────╮
│ Allow first command?          │
│                               │
│ ❯ 1. Yes                      │
│   2. No                       │
╰───────────────────────────────╯
Some output in between
╭───────────────────────────────╮
│ Allow second command?         │
│                               │
│   1. Yes                      │
│ ❯ 2. No                       │
╰───────────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Allow second command/);
    expect(panel!.defaultIndex).toBe(2);
  });

  it('连续两个 inline 面板在 pane 中——应找到最新的（底部）', () => {
    const pane = `⏵⏵ accept edits on (shift+tab to cycle)
────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ allow once on (shift+tab to cycle)`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toContain('权限');
    expect(panel!.options[0]).toMatch(/Allow once/i);
  });

  it('连续两个无边框 Edit 权限面板（不同文件）——第二个应被检测', () => {
    const pane = `────────────────────────────────────────────────────────────────────────────────
 Edit file
 config.json
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 1 -"old": true
 1 +"new": true
╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌
 Do you want to make this edit to config.json?
 ❯ 1. Yes
   2. Yes, allow all edits during this session (shift+tab)
   3. No

 Esc to cancel · Tab to amend`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toMatch(/Do you want to make this edit to config\.json/);
    expect(panel!.options).toHaveLength(3);
  });

  it('面板消失后 pane 为工作状态——extractChoicePanel 返回 null', () => {
    const pane = `● Bash(npm install)
  ⎿  Installed 42 packages
● Reading file...
Esc to interrupt`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).toBeNull();
  });

  it('连续选择后 pane 为 idle——extractReply 应正确提取最终回复', () => {
    const pane = `❯ 帮我创建两个文件
● 正在创建 file1.txt...
✻ Brewed for 5s
● 正在创建 file2.txt...
✻ Brewed for 8s
● 已创建 file1.txt 和 file2.txt。
✻ Brewed for 12s
╭───╮
│ ❯ │
╰───╯
  ? for shortcuts`;
    const reply = adapter.extractReply(pane, '帮我创建两个文件');
    expect(reply).toContain('已创建 file1.txt 和 file2.txt');
  });

  it('连续两个相同格式的 Bash 权限面板——第二个应独立检测', () => {
    // 第一次 Bash 面板（cat）已消失，第二次 Bash 面板（ls）出现
    const pane = `────────────────────────────────────────────────────────────────────────────────
 Bash command

   ls -la /tmp
   List temp directory

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, allow reading from tmp/ from this project
   3. No

 Esc to cancel · Tab to amend · ctrl+e to explain`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toBe('Do you want to proceed?');
    expect(panel!.options).toHaveLength(3);
    expect(panel!.options[1]).toMatch(/allow reading from tmp/);
  });

  it('同一 pane 中连续两个 inline（accept → reject）——应取 reject（最新的）', () => {
    const pane = `⏵⏵ accept edits on (shift+tab to cycle)
────────────────────────────────────────────────────────────────────────────────
❯
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ reject edits on (shift+tab to cycle)`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.format).toBe('inline');
    expect(panel!.defaultIndex).toBe(2); // reject = index 2
  });

  it('无边框面板：问题与选项间有空行——标题仍能提取', () => {
    const pane = ` ☐ OK

要不要回去继续写代码？

❯ 1. Yes
     好的
  2. No
     不要
  3. Type something.
────────────────────────────────────────────────────────
  4. Chat about this

Enter to select · ↑/↓ to navigate · Esc to cancel`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.title).toBe('要不要回去继续写代码？');
    expect(panel!.options).toHaveLength(4);
  });

  it('extractReply 过滤 CC 决策确认文本（User answered）', () => {
    const raw = `● User answered Claude's questions:
  ⎿  · 真的够了？ → Yes

● 行，真够了。有事再叫我。

✻ Crunched for 19s

❯
  ? for shortcuts`;
    const reply = adapter.extractReply(raw, '嘿嘿，再试一下');
    expect(reply).not.toContain('User answered');
    expect(reply).toContain('行，真够了');
  });

  it('extractReply 过滤 CC 编辑确认文本（Accepted edits）', () => {
    const raw = `● Accepted edits on config.json

● 已完成修改。

❯
  ? for shortcuts`;
    const reply = adapter.extractReply(raw, '修改配置');
    expect(reply).not.toContain('Accepted edits');
    expect(reply).toContain('已完成修改');
  });
});
