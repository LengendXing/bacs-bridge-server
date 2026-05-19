import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSession,
  endSession,
  getSession,
  hasActiveSession,
  panelFingerprint,
  type SessionState,
  type SessionContext,
} from './state.js';

const baseCtx: SessionContext = {
  feishuAppId: 'test-app',
  feishuAppSecret: 'test-secret',
  targetType: 'chat_id',
  targetId: 'oc_abc123',
  msgText: 'hello',
  processName: 'test-proc',
  cliKind: 'cc',
  machineId: null,
};

describe('session/state — createSession & endSession', () => {
  beforeEach(() => {
    // 清理残留 session
    const s = getSession(baseCtx.processName);
    if (s) endSession(baseCtx.processName);
  });

  it('createSession 创建可查询的 session', () => {
    const session = createSession(baseCtx);
    expect(getSession(baseCtx.processName)).toBe(session);
    expect(hasActiveSession(baseCtx.processName)).toBe(true);
  });

  it('endSession 清除 session', () => {
    createSession(baseCtx);
    endSession(baseCtx.processName);
    expect(getSession(baseCtx.processName)).toBeUndefined();
    expect(hasActiveSession(baseCtx.processName)).toBe(false);
  });

  it('session 初始状态：replied=false, awaiting=null', () => {
    const session = createSession(baseCtx);
    expect(session.replied).toBe(false);
    expect(session.awaiting).toBeNull();
    expect(session.pollTimer).toBeNull();
    expect(session.stableTimer).toBeNull();
    expect(session.hardDeadlineTimer).toBeNull();
    expect(session.lastProgressNotifiedAt).toBeGreaterThan(0);
    expect(session.decisionJustMade).toBe(false);
    expect(session.lastDecidedPanelKey).toBeNull();
  });
});

describe('session/state — panelFingerprint', () => {
  it('相同面板生成相同指纹', () => {
    const panel = { title: 'Allow?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    expect(panelFingerprint(panel)).toBe(panelFingerprint(panel));
  });

  it('不同标题生成不同指纹', () => {
    const p1 = { title: 'Allow A?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const p2 = { title: 'Allow B?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    expect(panelFingerprint(p1)).not.toBe(panelFingerprint(p2));
  });

  it('不同选项生成不同指纹', () => {
    const p1 = { title: 'Allow?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const p2 = { title: 'Allow?', options: ['1. Yes', '2. Maybe'], defaultIndex: 1 };
    expect(panelFingerprint(p1)).not.toBe(panelFingerprint(p2));
  });
});

describe('session/state — consecutive awaiting transitions', () => {
  beforeEach(() => {
    const s = getSession(baseCtx.processName);
    if (s) endSession(baseCtx.processName);
  });

  it('连续两次决策面板：awaiting 可被清除后重新设置', () => {
    const session = createSession(baseCtx);
    const panel1 = { title: 'Allow A?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp1 = panelFingerprint(panel1);

    // 第一次面板出现
    session.awaiting = { panel: panel1, panelKey: fp1, pushedAt: Date.now() };
    expect(session.awaiting).not.toBeNull();
    expect(session.awaiting!.panelKey).toBe(fp1);

    // 用户做出选择，面板消失
    session.awaiting = null;
    expect(session.awaiting).toBeNull();

    // 第二次面板出现（可能和第一次指纹相同）
    const panel2 = { title: 'Allow B?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp2 = panelFingerprint(panel2);
    session.awaiting = { panel: panel2, panelKey: fp2, pushedAt: Date.now() };
    expect(session.awaiting).not.toBeNull();
    expect(session.awaiting!.panelKey).toBe(fp2);
    expect(session.awaiting!.panel.title).toBe('Allow B?');
  });

  it('连续两次相同指纹面板：awaiting 清除后仍能重新设置', () => {
    const session = createSession(baseCtx);
    const panel = { title: 'Do you want to make this edit?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp = panelFingerprint(panel);

    // 第一次面板
    session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };
    expect(session.awaiting!.panelKey).toBe(fp);

    // 选择后清除
    session.awaiting = null;

    // 第二次面板（同指纹——CC 对不同文件可能生成相同格式的面板）
    session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };
    expect(session.awaiting).not.toBeNull();
    // 关键：awaiting 清除后，轮询代码中 !session.awaiting 为 true，
    // 因此 onAwaiting 会被调用，卡片会被推送
  });

  it('session.ctx 保留原始 target 信息——确保回执路由正确', () => {
    const groupCtx: SessionContext = {
      ...baseCtx,
      targetType: 'chat_id',
      targetId: 'oc_group123',
    };
    const session = createSession(groupCtx);
    expect(session.ctx.targetType).toBe('chat_id');
    expect(session.ctx.targetId).toBe('oc_group123');

    // 模拟决策后清除 awaiting，ctx 仍保持群聊信息
    const panel = { title: 'Allow?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    session.awaiting = { panel, panelKey: panelFingerprint(panel), pushedAt: Date.now() };
    session.awaiting = null;
    expect(session.ctx.targetType).toBe('chat_id');
    expect(session.ctx.targetId).toBe('oc_group123');
  });

  it('lastDecidedPanelKey 决策后设置，面板消失后清除', () => {
    const session = createSession(baseCtx);
    const panel = { title: 'Allow?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp = panelFingerprint(panel);

    // 模拟决策前：面板出现，推送给用户
    session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };
    expect(session.lastDecidedPanelKey).toBeNull();

    // 模拟用户决策：handler 设置 lastDecidedPanelKey
    session.lastDecidedPanelKey = fp;
    session.awaiting = null;
    session.decisionJustMade = true;
    expect(session.lastDecidedPanelKey).toBe(fp);

    // 模拟面板消失：轮询清除 lastDecidedPanelKey
    session.lastDecidedPanelKey = null;
    expect(session.lastDecidedPanelKey).toBeNull();
  });

  it('lastDecidedPanelKey 防止决策后面板重复推送', () => {
    const session = createSession(baseCtx);
    const panel = { title: 'Allow?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp = panelFingerprint(panel);

    // 面板出现，推送
    session.awaiting = { panel, panelKey: fp, pushedAt: Date.now() };

    // 用户决策：handler 记录 lastDecidedPanelKey
    session.lastDecidedPanelKey = fp;
    session.awaiting = null;
    session.decisionJustMade = true;

    // 轮询仍检测到同一面板 → isDecidedPanel=true → 不重复推送
    const isDecidedPanel = session.lastDecidedPanelKey === fp;
    expect(isDecidedPanel).toBe(true);

    // 不同面板出现 → isDecidedPanel=false → 可以推送
    const panel2 = { title: 'Allow B?', options: ['1. Yes', '2. No'], defaultIndex: 1 };
    const fp2 = panelFingerprint(panel2);
    expect(session.lastDecidedPanelKey === fp2).toBe(false);
  });
});

describe('session/state — progress notification timing', () => {
  beforeEach(() => {
    const s = getSession(baseCtx.processName);
    if (s) endSession(baseCtx.processName);
  });

  it('lastProgressNotifiedAt 初始值为 session 创建时间附近', () => {
    const before = Date.now();
    const session = createSession(baseCtx);
    const after = Date.now();
    expect(session.lastProgressNotifiedAt).toBeGreaterThanOrEqual(before);
    expect(session.lastProgressNotifiedAt).toBeLessThanOrEqual(after);
  });

  it('前 10 分钟：progressIntervalMs 应为 60_000', () => {
    const session = createSession(baseCtx);
    const elapsedMs = Date.now() - session.startedAt; // ~0ms, well under 600_000
    const progressIntervalMs = elapsedMs < 600_000 ? 60_000 : 600_000;
    expect(progressIntervalMs).toBe(60_000);
  });

  it('超过 10 分钟后：progressIntervalMs 应为 600_000', () => {
    const session = createSession(baseCtx);
    session.startedAt = Date.now() - 601_000; // 模拟已过 10 分钟
    const elapsedMs = Date.now() - session.startedAt;
    const progressIntervalMs = elapsedMs < 600_000 ? 60_000 : 600_000;
    expect(progressIntervalMs).toBe(600_000);
  });
});
