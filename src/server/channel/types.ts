/**
 * @module channel/types
 * @description 消息渠道接口定义
 *
 * 所有消息来源（飞书 / Telegram / 微信等）必须实现此接口。
 * bridge 主流程只跟 Channel 打交道，不感知具体消息源的细节。
 */

/** 渠道统一接口 */
export interface Channel {
  /** 渠道标识 */
  kind: string; // 'feishu' | 'telegram' | 'wechat' | ...

  /** 启动渠道连接（如 WebSocket 长连接、长轮询等）
   *  @param binding - 绑定记录
   */
  start(binding: any): Promise<void>;

  /** 停止渠道连接
   *  @param appId - 渠道连接的唯一标识（如飞书 App ID）
   */
  stop(appId: string): void;

  /** 发送文本消息
   *  @param appId - 渠道标识
   *  @param appSecret - 渠道密钥
   *  @param targetType - 目标类型（如 'chat_id' / 'open_id'）
   *  @param targetId - 目标 ID
   *  @param text - 文本内容
   */
  sendText(appId: string, appSecret: string, targetType: string, targetId: string, text: string): Promise<void>;

  /** 发送回复卡片
   *  @param appId - 渠道标识
   *  @param appSecret - 渠道密钥
   *  @param targetType - 目标类型
   *  @param targetId - 目标 ID
   *  @param reply - 回复内容对象
   */
  sendReplyCard(appId: string, appSecret: string, targetType: string, targetId: string, reply: ReplyPayload): Promise<void>;

  /** 检查连接状态
   *  @param appId - 渠道标识
   */
  isConnected(appId: string): boolean;

  /** 恢复所有已绑定的连接（服务重启时调用） */
  startAll(): Promise<void>;
}

/** 回复内容载荷 */
export interface ReplyPayload {
  /** 进程名 */
  processName: string;
  /** 用户问题摘要 */
  userQuestion: string;
  /** 回复正文 */
  reply: string;
  /** 耗时（秒） */
  elapsed: number;
  /** 是否超时兜底 */
  isTimeout: boolean;
}
