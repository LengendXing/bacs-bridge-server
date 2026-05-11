/**
 * @module channel/router
 * @description 消息路由调度
 *
 * 收到渠道消息后，根据绑定关系路由到对应的 CLI 进程。
 * 当前只注册了 FeishuChannel，后续添加 Telegram/微信等只需注册新 Channel。
 *
 * 职责：
 * 1. 收到消息 → 查 binding 获取 cliKind + provider + model
 * 2. 构建 CliStartConfig（环境变量注入）
 * 3. 获取对应 adapter → sendInput
 * 4. 启动会话状态机（轮询 + isIdle + extractReply）
 * 5. 回复就绪 → 通过同一 Channel 发送回复
 */
import feishuChannel from './feishu/index.js';
/** 已注册的渠道实例映射: kind → Channel */
const channelRegistry = new Map([
    ['feishu', feishuChannel],
]);
/**
 * 获取渠道实例
 *
 * @param kind - 渠道类型
 * @returns Channel 实例
 */
export function getChannel(kind) {
    return channelRegistry.get(kind);
}
/**
 * 恢复所有渠道的所有绑定连接
 *
 * 服务启动时调用，遍历所有已注册 Channel 执行 startAll()
 */
export async function restoreAllChannels() {
    for (const [kind, channel] of channelRegistry) {
        try {
            await channel.startAll();
        }
        catch (e) {
            console.error(`恢复 ${kind} 渠道连接失败:`, e.message);
        }
    }
}
export { feishuChannel };
