/**
 * 前后端共享类型定义
 * API 请求/响应的 TypeScript 类型
 */

/** API 统一响应格式 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data?: T;
}

/** 错误码常量 */
export const ErrorCode = {
  SUCCESS: 0,
  TOKEN_EXPIRED: 1001,
  PERMISSION_DENIED: 1002,
  PARAM_ERROR: 1003,
  NOT_FOUND: 1004,
} as const;

/** CLI 种类 */
export type CliKind = 'cc' | 'codex';

/** 服务商类型 */
export type ProviderKind = 'local' | 'custom';

/** 服务商信息 */
export interface Provider {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 模型信息 */
export interface Model {
  id: number;
  providerId: number;
  modelId: string;
  displayName: string | null;
  cliKind: CliKind;
  fetchedAt: string;
}

/** 绑定信息 */
export interface Binding {
  id: string;
  processName: string;
  cliKind: CliKind;
  providerId: number | null;
  modelId: number | null;
  feishuAppId: string | null;
  feishuAppSecret: string | null;
  status: 'online' | 'offline';
  wsConnected: boolean;
  createdAt: string;
  updatedAt: string;
  /** 关联查询结果 */
  provider?: Provider;
  model?: Model;
}

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
}

/** 登录响应 */
export interface LoginResponse {
  token: string;
  require2fa: boolean;
  tempToken?: string;
}

/** 2FA 验证请求 */
export interface Verify2faRequest {
  tempToken: string;
  code: string;
  trustDevice?: boolean;
}

/** 2FA 设置响应（含 QR 码 URL） */
export interface TotpSetupResponse {
  qrUrl: string;
  secret: string;
}

/** 绑定创建请求 */
export interface CreateBindingRequest {
  processName: string;
  cliKind: CliKind;
  providerId: number | null;
  modelId: number | null;
  feishuAppId: string;
  feishuAppSecret: string;
}

/** 服务商创建请求 */
export interface CreateProviderRequest {
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
}
