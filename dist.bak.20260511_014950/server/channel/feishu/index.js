/**
 * @module channel/feishu/index
 * @description 飞书消息渠道实现
 *
 * 实现 Channel 接口，将飞书 WebSocket 长连接和消息发送委托给
 * ws-client 和 sender 模块。作为消息渠道的统一入口，
 * bridge 主流程只与 Channel 接口交互，不感知飞书的具体细节。
 */
import * as wsClient from './ws-client.js';
import * as sender from './sender.js';
/**
 * 飞书消息渠道
 *
 * 单例实现，委托给 ws-client（连接管理）和 sender（消息发送）模块。
 */
const feishuChannel = {
    /** 渠道标识 */
    kind: 'feishu',
    /**
     * 启动飞书 WebSocket 长连接
     *
     * 委托给 ws-client.start()，建立与飞书服务器的 WebSocket 连接，
     * 注册消息处理器，开始接收飞书消息事件。
     *
     * @param binding - 绑定记录（含飞书 App ID/Secret、进程名等）
     */
    async start(binding) {
        return wsClient.start(binding);
    },
    /**
     * 停止飞书 WebSocket 长连接
     *
     * 委托给 ws-client.stop()，关闭指定 appId 的 WebSocket 连接。
     *
     * @param appId - 飞书应用 App ID
     */
    stop(appId) {
        wsClient.stop(appId);
    },
    /**
     * 发送文本消息到飞书
     *
     * 委托给 sender.sendText()，通过飞书 API 发送纯文本消息。
     *
     * @param appId         - 飞书应用 App ID
     * @param appSecret     - 飞书应用 App Secret
     * @param targetType    - 目标类型（'chat_id' / 'open_id'）
     * @param targetId      - 目标 ID
     * @param text          - 文本内容
     */
    async sendText(appId, appSecret, targetType, targetId, text) {
        await sender.sendText(appId, appSecret, targetType, targetId, text);
    },
    /**
     * 发送回复卡片到飞书
     *
     * 委托给 sender.sendReplyCard()，发送包含问题摘要、回复正文、
     * 耗时信息的交互式卡片。
     *
     * @param appId         - 飞书应用 App ID
     * @param appSecret     - 飞书应用 App Secret
     * @param targetType    - 目标类型
     * @param targetId      - 目标 ID
     * @param reply         - 回复内容载荷
     */
    async sendReplyCard(appId, appSecret, targetType, targetId, reply) {
        await sender.sendReplyCard(appId, appSecret, targetType, targetId, reply);
    },
    /**
     * 检查飞书 WebSocket 连接状态
     *
     * 委托给 ws-client.isConnected()。
     *
     * @param appId - 飞书应用 App ID
     * @returns 已连接返回 true
     */
    isConnected(appId) {
        return wsClient.isConnected(appId);
    },
    /**
     * 启动所有已绑定飞书应用的 WebSocket 连接
     *
     * 委托给 ws-client.startAll()，服务重启时调用以恢复所有连接。
     */
    async startAll() {
        return wsClient.startAll();
    },
};
export default feishuChannel;
