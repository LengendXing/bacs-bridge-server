export const ErrorCode = {
  SUCCESS: 0,
  TOKEN_EXPIRED: 1001,
  PERMISSION_DENIED: 1002,
  PARAM_ERROR: 1003,
  NOT_FOUND: 1004,
} as const;

/** 飞书 Webhook 通知卡片颜色模板 */
export const FeishuCardTemplate = {
  GREEN: 'green',
  BLUE: 'blue',
  ORANGE: 'orange',
  RED: 'red',
} as const;

/** 飞书 Webhook 地址 */
export const FEISHU_WEBHOOK_URL =
  'https://open.feishu.cn/open-apis/bot/v2/hook/9f51596d-b832-4f42-a216-9752044c48b9';

/** 默认端口 */
export const DEFAULT_PORT = 3456;

/** JWT 过期时间（24小时） */
export const JWT_EXPIRES_IN = '24h';

/** 信任设备有效期（30天） */
export const TRUSTED_DEVICE_DAYS = 30;

/** 飞书卡片原生表格上限 */
export const FEISHU_TABLE_LIMIT = 4;
