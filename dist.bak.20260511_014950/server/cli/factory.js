/**
 * @module cli/factory
 * @description CLI Adapter 工厂
 *
 * 根据 cliKind 返回对应的 CliAdapter 实例。
 * 新增 CLI 类型只需：1) 实现 CliAdapter 接口 2) 在此注册
 */
import ccAdapter from './cc-adapter.js';
import codexAdapter from './codex-adapter.js';
/** 已注册的 adapter 实例映射 */
const registry = new Map([
    ['cc', ccAdapter],
    ['codex', codexAdapter],
]);
/**
 * 获取 CLI Adapter 实例
 *
 * @param kind - CLI 类型（'cc' | 'codex'）
 * @returns 对应的 CliAdapter 实例
 * @throws 未知 CLI 类型时抛出错误
 */
export function getAdapter(kind) {
    const adapter = registry.get(kind);
    if (!adapter) {
        throw new Error(`未知的 CLI 类型: ${kind}，已注册: ${[...registry.keys()].join(', ')}`);
    }
    return adapter;
}
/**
 * 获取所有已注册的 CLI 类型
 *
 * @returns CLI 类型数组
 */
export function getRegisteredKinds() {
    return [...registry.keys()];
}
