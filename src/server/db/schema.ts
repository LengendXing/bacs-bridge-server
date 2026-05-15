/**
 * @module db/schema
 * @description Drizzle ORM 表定义
 *
 * 定义全部 8 张数据表：
 * 1. users         — 管理员账户
 * 2. trusted_devices — 2FA 信任设备
 * 3. providers     — 服务商（API 网关）
 * 4. models        — 模型列表（从服务商 API 拉取）
 * 5. machines      — 远程机器
 * 6. bindings      — 绑定关系（进程 ↔ 飞书应用 ↔ 服务商/模型）
 * 7. audit_logs    — 审计日志
 * 8. app_settings  — 应用级 KV 设置（如对外服务地址）
 */

import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ════════════════════════════════════════════════════════════════════
// 1. users — 管理员账户
// ════════════════════════════════════════════════════════════════════

/**
 * 管理员用户表
 * - username 唯一，作为登录标识
 * - passwordHash 存储 bcrypt 哈希
 * - totpSecret 为 base32 编码的 TOTP 密钥，NULL 表示未开启 2FA
 */
export const users = sqliteTable('users', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 登录用户名（唯一） */
  username: text('username').notNull().unique(),

  /** bcrypt 密码哈希 */
  passwordHash: text('password_hash').notNull(),

  /** TOTP 密钥（base32），NULL = 未开启两步验证 */
  totpSecret: text('totp_secret'),

  /** 是否已启用两步验证 */
  totpEnabled: integer('totp_enabled', { mode: 'boolean' }).default(false),

  /** TOTP 恢复码（JSON 数组字符串），用于丢失认证器时恢复访问 */
  recoveryCodes: text('recovery_codes'),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),

  /** 更新时间 */
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 2. trusted_devices — 2FA 信任设备
// ════════════════════════════════════════════════════════════════════

/**
 * 信任设备表
 * - 用户勾选"信任此设备"后，生成 deviceToken 存入 cookie
 * - 有效期内（默认 30 天）该设备可跳过 2FA 验证
 */
export const trustedDevices = sqliteTable('trusted_devices', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 关联用户 ID */
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),

  /** 随机生成的设备令牌，存入浏览器 cookie（辅助通道，主要靠 deviceId） */
  deviceToken: text('device_token').notNull().unique(),

  /** 浏览器端 FingerprintJS 计算的稳定设备指纹，存 localStorage */
  deviceId: text('device_id'),

  /** 设备名称（从 User-Agent 摘要生成，如 "Chrome / macOS"） */
  deviceName: text('device_name'),

  /** 创建时的 IP 地址 */
  ipAddress: text('ip_address'),

  /** 过期时间（通常为创建时间 + 30 天） */
  expiresAt: text('expires_at').notNull(),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 3. providers — 服务商
// ════════════════════════════════════════════════════════════════════

/**
 * 服务商表
 * - kind='local'：读本机环境变量，不存密钥
 * - kind='custom'：用户提供 base_url + api_key，系统保存用于注入子进程
 * - 创建/编辑后自动拉取该服务商的模型列表
 */
export const providers = sqliteTable('providers', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 服务商名称，如 "Anthropic 官方" / "OpenAI 官方" / "自建网关" */
  name: text('name').notNull(),

  /** 服务商类型：'local'（本机环境变量）| 'custom'（用户提供凭据） */
  kind: text('kind').notNull().default('custom'),

  /** API 请求地址（custom 模式必填，local 模式为空） */
  baseUrl: text('base_url'),

  /** API 密钥（custom 模式必填，local 模式为空） */
  apiKey: text('api_key'),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),

  /** 更新时间 */
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 4. models — 模型列表
// ════════════════════════════════════════════════════════════════════

/**
 * 模型列表表
 * - 数据来源：调用服务商 /v1/models API 自动拉取
 * - cliKind 标记该模型支持哪种 CLI 协议（cc / codex）
 * - 管理员可手动覆盖 cliKind
 * - 同一 provider_id + model_id 组合唯一
 */
export const models = sqliteTable('models', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 关联服务商 ID */
  providerId: integer('provider_id').notNull().references(() => providers.id, { onDelete: 'cascade' }),

  /** 模型 ID，如 "claude-sonnet-4-20250514" / "gpt-4.1" */
  modelId: text('model_id').notNull(),

  /** 显示名称，如 "Claude Sonnet 4" / "GPT-4.1" */
  displayName: text('display_name'),

  /** 该模型支持的 CLI 协议：'cc' | 'codex' */
  cliKind: text('cli_kind').notNull(),

  /** 上次从服务商 API 拉取的时间 */
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`),

  /** 同一服务商下模型 ID 唯一 */
}, (table) => ({
  providerModelIdx: uniqueIndex('provider_model_idx').on(table.providerId, table.modelId),
}));

// ════════════════════════════════════════════════════════════════════
// 5. machines — 远程机器
// ════════════════════════════════════════════════════════════════════

export const machines = sqliteTable('machines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull().default(22),
  osType: text('os_type').notNull().default('linux'),
  /** 系统版本号，如 "Darwin 22.6.0"。本机在启动时自动填充 */
  osVersion: text('os_version'),
  authType: text('auth_type').notNull().default('password'),
  username: text('username').notNull(),
  password: text('password'),
  privateKey: text('private_key'),
  passphrase: text('passphrase'),
  notes: text('notes'),
  status: text('status').notNull().default('unknown'),
  /** 内置记录标记：1=系统内置（如本机），不允许修改/删除 */
  builtin: integer('builtin', { mode: 'boolean' }).notNull().default(false),
  lastHeartbeat: text('last_heartbeat'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 6. bindings — 绑定关系
// ════════════════════════════════════════════════════════════════════

/**
 * 绑定关系表
 * - processName 唯一，作为 tmux 会话标识
 * - providerId + modelId 关联服务商和模型
 * - 运行时环境变量注入逻辑：
 *   - local → 不注入，CLI 子进程继承系统 env
 *   - custom + cc → 注入 ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
 *   - custom + codex → 注入 OPENAI_BASE_URL + OPENAI_API_KEY + OPENAI_MODEL
 */
export const bindings = sqliteTable('bindings', {
  /** UUID 主键 */
  id: text('id').primaryKey(),

  /** 进程名（唯一），同时也是 tmux 会话名的一部分 */
  processName: text('process_name').notNull().unique(),

  /** CLI 类型：'cc' | 'codex' */
  cliKind: text('cli_kind').notNull().default('cc'),

  /** 关联服务商 ID（可为空，表示使用本机环境变量） */
  providerId: integer('provider_id').references(() => providers.id, { onDelete: 'set null' }),

  /** 关联模型 ID（可为空，使用默认模型）— 仅当用户从探查成功的列表选时生效 */
  modelId: integer('model_id').references(() => models.id, { onDelete: 'set null' }),

  /** 模型字符串覆盖（优先于 modelId FK）。
   *  用于：1) 服务商不支持 /v1/models 探查时从默认清单选；2) 用户手输自定义模型 ID。
   *  buildCliConfig 读取顺序：modelOverride ?? models.modelId 字符串。 */
  modelOverride: text('model_override'),

  /** 推理 effort 档位（cc：low|medium|high|xhigh|max；codex：minimal|low|medium|high|xhigh）。
   *  null = 不注入（用 CLI 默认）。 */
  effort: text('effort'),

  /** 关联机器 ID（null = 本地执行，向后兼容） */
  machineId: integer('machine_id').references(() => machines.id),

  /** 飞书应用 App ID */
  feishuAppId: text('feishu_app_id'),

  /** 飞书应用 App Secret */
  feishuAppSecret: text('feishu_app_secret'),

  /** 进程状态：'online' | 'offline' */
  status: text('status').default('offline'),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),

  /** 更新时间 */
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 7. audit_logs — 审计日志
// ════════════════════════════════════════════════════════════════════

/**
 * 审计日志表
 * - 记录所有关键操作：登录、绑定创建/删除、服务商操作等
 * - 供管理面板"日志"页面查询展示
 */
export const auditLogs = sqliteTable('audit_logs', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 操作用户 ID（系统操作为 NULL） */
  userId: integer('user_id').references(() => users.id),

  /** 操作类型，如 'login' | 'bind_create' | 'bind_delete' | 'provider_create' | ... */
  action: text('action').notNull(),

  /** 操作对象（如进程名、服务商名） */
  target: text('target'),

  /** 补充信息 */
  detail: text('detail'),

  /** 请求 IP 地址 */
  ipAddress: text('ip_address'),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 9. bacs_chat_time_line — 消息发送时间线
// ════════════════════════════════════════════════════════════════════

/**
 * 消息时间线表（业务前缀 bacs_）
 * 记录每一条从外部平台（飞书 / Telegram 等）发送到本系统的消息。
 * 用于首页实时 Timeline 展示。
 */
export const chatTimeLine = sqliteTable('bacs_chat_time_line', {
  /** 自增主键 */
  id: integer('id').primaryKey({ autoIncrement: true }),

  /** 消息来源平台：'feishu' | 'telegram' | ... */
  platform: text('platform').notNull().default('feishu'),

  /** 目标机器 IP（本机为 'localhost'，远程为实际 IP） */
  targetIp: text('target_ip').notNull().default('localhost'),

  /** 绑定的进程名 */
  processName: text('process_name').notNull(),

  /** 消息正文 */
  content: text('content').notNull(),

  /** 创建时间 */
  createdAt: text('created_at').default(sql`(datetime('now'))`),
});

// ════════════════════════════════════════════════════════════════════
// 8. app_settings — 应用级 KV 设置
// ════════════════════════════════════════════════════════════════════

/**
 * 应用级设置表（key-value）
 * 已知 key：
 * - external_url：对外服务地址（含协议与端口，无尾斜杠），用于生成快捷登录二维码的 server 字段
 */
export const appSettings = sqliteTable('app_settings', {
  /** 配置键（主键） */
  key: text('key').primaryKey(),

  /** 配置值 */
  value: text('value'),

  /** 更新时间 */
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
});
