/**
 * @file pty-bridge.test.ts
 * @description 仅覆盖纯函数 isSafeSessionName 的注入防御断言。
 *
 * openLocalTerminal / openSshTerminal 真正起子进程或 SSH channel，
 * 单测里不便覆盖；端到端验证走 docs/plans/v1.1.3-web-terminal.md 里的测试计划。
 */
import { describe, it, expect } from 'vitest';
import { isSafeSessionName } from './pty-bridge.js';

describe('isSafeSessionName', () => {
  it('接受合法的会话名', () => {
    expect(isSafeSessionName('cc-foo')).toBe(true);
    expect(isSafeSessionName('codex-bar_baz')).toBe(true);
    expect(isSafeSessionName('A1-_2')).toBe(true);
  });

  it('拒绝包含 shell 元字符 / 空格的注入尝试', () => {
    expect(isSafeSessionName('cc-foo;rm -rf /')).toBe(false);
    expect(isSafeSessionName('cc foo')).toBe(false);
    expect(isSafeSessionName('cc-foo$(whoami)')).toBe(false);
    expect(isSafeSessionName('cc-foo`id`')).toBe(false);
    expect(isSafeSessionName('cc-foo|nc 1.2.3.4 9000')).toBe(false);
    expect(isSafeSessionName('cc-foo/../etc')).toBe(false);
    expect(isSafeSessionName('cc-foo\nmalicious')).toBe(false);
  });

  it('拒绝空字符串与超长名字', () => {
    expect(isSafeSessionName('')).toBe(false);
    expect(isSafeSessionName('a'.repeat(129))).toBe(false);
    expect(isSafeSessionName('a'.repeat(128))).toBe(true);
  });
});
