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
  modelOverride: string | null;
  effort: string | null;
  machineId: number | null;
  machineName: string | null;
  /** v1.1.14：关联 bacs_bots 表 */
  botId: number | null;
  botName: string | null;
  botPlatform: string | null;
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

/** 机器信息 */
export interface Machine {
  id: number;
  name: string;
  host: string;
  port: number;
  osType: 'linux' | 'mac' | 'windows';
  /** 系统版本号（如 "Darwin 22.6.0"），仅本机自动填充 */
  osVersion: string | null;
  authType: 'password' | 'key';
  username: string;
  hasPassword: boolean;
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  notes: string | null;
  status: 'online' | 'offline' | 'unknown';
  /** 系统内置记录（如本机），不可编辑/删除 */
  builtin: boolean;
  lastHeartbeat: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 机器创建请求 */
export interface CreateMachineRequest {
  name: string;
  host: string;
  port?: number;
  osType?: 'linux' | 'mac';
  authType: 'password' | 'key';
  username: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  notes?: string;
}

/** 机器连接测试响应 */
export interface MachineTestResult {
  ok: boolean;
  hostname?: string;
  os?: string;
  tmuxVersion?: string;
  claudeVersion?: string;
  latencyMs?: number;
  error?: string;
}

/** 机器预装步骤状态 */
export type ProvisionStepStatus = 'skip' | 'installed' | 'upgraded' | 'created' | 'failed' | 'skipped-no-claude' | 'installed-via-npx';

/** 机器预装响应 */
export interface ProvisionResult {
  ok: boolean;
  node?: string;
  tmux?: string;
  claude?: string;
  steps?: string[];
  error?: string;
}

/** 登录请求 */
export interface LoginRequest {
  username: string;
  password: string;
  deviceId?: string;
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
  deviceId?: string;
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
  modelOverride: string | null;
  effort: string | null;
  machineId?: number | null;
  /** v1.1.14：优先通过 botId 关联 bacs_bots（推荐）；旧字段兼容期保留 */
  botId?: number | null;
  feishuAppId?: string;
  feishuAppSecret?: string;
}

/** 服务商创建请求 */
export interface CreateProviderRequest {
  name: string;
  kind: ProviderKind;
  baseUrl?: string;
  apiKey?: string;
}

/** 绑定运行时状态 */
export interface BindingRuntime {
  state: 'idle' | 'working' | 'awaiting_choice' | 'unknown';
  paneOutput: string;
  sessionExists: boolean;
}

/** 绑定详情（含运行时状态） */
export interface BindingDetail extends Binding {
  runtime: BindingRuntime;
}
