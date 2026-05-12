import { describe, it, expect } from 'vitest';
import adapter from './codex-adapter.js';

describe('codex-adapter.buildStartCmd', () => {
  const session = 'codex-test';

  it('使用 bash -ilc 包裹以加载远程 rc 文件', () => {
    const cmd = adapter.buildStartCmd(session, { providerKind: 'local', envVars: {} });
    expect(cmd).toMatch(/^tmux new-session -d -s codex-test "bash -ilc '/);
    expect(cmd).toContain('exec codex');
  });

  it('指定 modelId 时拼入 -m 参数（codex 用 -m 不是 --model）', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'gpt-5.5',
    });
    expect(cmd).toContain("-m '\\''gpt-5.5'\\''");
    expect(cmd).not.toContain('--model');
  });

  it('指定 effort 时拼入 -c model_reasoning_effort=<level>', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'gpt-5.5',
      effort: 'xhigh',
    });
    expect(cmd).toContain("-c model_reasoning_effort='\\''xhigh'\\''");
  });

  it('不指定 effort 时不应出现 model_reasoning_effort', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'local',
      envVars: {},
      modelId: 'gpt-5.4-mini',
    });
    expect(cmd).not.toContain('model_reasoning_effort');
  });

  it('custom provider 注入 OPENAI_BASE_URL / OPENAI_API_KEY', () => {
    const cmd = adapter.buildStartCmd(session, {
      providerKind: 'custom',
      envVars: {
        OPENAI_BASE_URL: 'https://api.example.com',
        OPENAI_API_KEY: 'sk-test',
      },
      modelId: 'gpt-5.5',
      effort: 'high',
    });
    expect(cmd).toContain("export OPENAI_BASE_URL='\\''https://api.example.com'\\''");
    expect(cmd).toContain("export OPENAI_API_KEY='\\''sk-test'\\''");
    expect(cmd).toContain("-m '\\''gpt-5.5'\\''");
    expect(cmd).toContain("-c model_reasoning_effort='\\''high'\\''");
  });

  it('使用 exec 替换 bash 进程', () => {
    const cmd = adapter.buildStartCmd(session, { providerKind: 'local', envVars: {} });
    expect(cmd).toContain('exec codex');
  });
});

describe('codex-adapter.extractChoicePanel (复用 cc 实现)', () => {
  it('识别 ╭─...─╮ 框 + 多选项 → 返回 panel', () => {
    const pane = `╭──────────────────────────╮
│ Apply patch?             │
│                          │
│ ❯ 1. Yes                 │
│   2. No                  │
╰──────────────────────────╯`;
    const panel = adapter.extractChoicePanel(pane);
    expect(panel).not.toBeNull();
    expect(panel!.options).toHaveLength(2);
    expect(panel!.defaultIndex).toBe(1);
  });

  it('普通光标行 ">_" 不应误判', () => {
    expect(adapter.extractChoicePanel('  > \n')).toBeNull();
  });
});
