import { describe, it, expect } from 'vitest';
import adapter from './cc-adapter.js';

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
