# 机器人 × AI-CLI 桥接系统 — REST API 文档

> 面向 **Android 客户端** 的接口文档
> 服务版本：v1.0.6
> 文档版本：2026-05-11

---

## 目录

- [1. 通用约定](#1-通用约定)
  - [1.1 Base URL](#11-base-url)
  - [1.2 通用响应格式](#12-通用响应格式)
  - [1.3 错误码](#13-错误码)
  - [1.4 认证方式](#14-认证方式)
  - [1.5 字段命名与时间格式](#15-字段命名与时间格式)
- [2. 系统接口](#2-系统接口)
  - [2.1 健康检查](#21-健康检查)
- [3. 认证接口](#3-认证接口)
  - [3.1 账号密码登录](#31-账号密码登录)
  - [3.2 2FA 验证码校验](#32-2fa-验证码校验)
  - [3.3 登出](#33-登出)
  - [3.4 获取 2FA 设置信息](#34-获取-2fa-设置信息)
  - [3.5 启用 2FA](#35-启用-2fa)
  - [3.6 禁用 2FA](#36-禁用-2fa)
  - [3.7 查询 2FA 状态](#37-查询-2fa-状态)
  - [3.8 修改密码](#38-修改密码)
  - [3.9 生成扫码登录短 Token](#39-生成扫码登录短-token)
  - [3.10 扫码登录换取长 Token](#310-扫码登录换取长-token)
- [4. 绑定接口（仪表盘）](#4-绑定接口仪表盘)
  - [4.1 查询所有绑定及状态](#41-查询所有绑定及状态)
  - [4.2 新建绑定（自动启动 CLI）](#42-新建绑定自动启动-cli)
  - [4.3 挂载已有会话](#43-挂载已有会话)
  - [4.4 编辑绑定](#44-编辑绑定)
  - [4.5 解绑](#45-解绑)
- [5. 服务商接口](#5-服务商接口)
  - [5.1 列出所有服务商](#51-列出所有服务商)
  - [5.2 新建服务商](#52-新建服务商)
  - [5.3 编辑服务商](#53-编辑服务商)
  - [5.4 删除服务商](#54-删除服务商)
- [6. 模型接口](#6-模型接口)
  - [6.1 查询模型列表](#61-查询模型列表)
  - [6.2 刷新模型列表](#62-刷新模型列表)
  - [6.3 修改模型 cliKind](#63-修改模型-clikind)
- [7. 会话接口](#7-会话接口)
  - [7.1 列出所有 tmux 会话](#71-列出所有-tmux-会话)
  - [7.2 列出未绑定的 tmux 会话](#72-列出未绑定的-tmux-会话)
- [8. 机器接口](#8-机器接口)
  - [8.1 列出所有机器](#81-列出所有机器)
  - [8.2 查询单台机器](#82-查询单台机器)
  - [8.3 新建机器](#83-新建机器)
  - [8.4 编辑机器](#84-编辑机器)
  - [8.5 删除机器](#85-删除机器)
  - [8.6 连接测试](#86-连接测试)
  - [8.7 心跳检测](#87-心跳检测)
- [9. 日志接口](#9-日志接口)
  - [9.1 查询审计日志](#91-查询审计日志)
  - [9.2 查询系统日志](#92-查询系统日志)
  - [9.3 实时日志推送（SSE）](#93-实时日志推送sse)
- [10. 设置接口](#10-设置接口)
  - [10.1 读取对外服务地址](#101-读取对外服务地址)
  - [10.2 保存对外服务地址](#102-保存对外服务地址)
- [11. 附录 — 数据模型](#11-附录--数据模型)

---

## 1. 通用约定

### 1.1 Base URL

服务默认监听 `0.0.0.0:3456`。

```
http://<host>:3456
```

> Android 客户端应允许用户自定义服务地址（含协议与端口）。在调用 `POST /api/auth/qr-token` 时，服务端会返回 `server` 字段，建议客户端将其持久化作为默认 Base URL。

### 1.2 通用响应格式

**所有接口均返回 HTTP 200，业务结果由响应体的 `code` 字段表达**（SSE 端点除外）。

```typescript
interface ApiResponse<T = unknown> {
  code: number;       // 0 表示成功；非 0 详见错误码表
  message?: string;   // 错误描述或操作提示，成功时可能省略
  data?: T;           // 业务数据，按各接口约定
}
```

成功示例：

```json
{ "code": 0, "data": { /* ... */ } }
```

失败示例：

```json
{ "code": 1002, "message": "账号或密码错误" }
```

### 1.3 错误码

| code | 含义 | 客户端处理建议 |
|------|------|----------------|
| `0` | 成功 | 正常处理 `data` |
| `1001` | 服务端通用错误 / Token 过期 | 提示用户重试；若发生在认证接口外，且伴随 HTTP 401，触发重新登录流程 |
| `1002` | 认证失败 / 权限不足 / 密码错误 / Token 无效 | 登录类提示「账号或密码错误」；其他场景跳登录页 |
| `1003` | 参数错误（必填项缺失、格式不合法等） | 提示具体 `message`，要求用户修正输入 |
| `1004` | 资源不存在 | 提示「资源不存在」，刷新列表 |

> **HTTP 状态码**：登录态相关接口在 token 缺失/失效时会返回 `HTTP 401 + code 1002`。其他业务错误一律返回 `HTTP 200`。

### 1.4 认证方式

除 `GET /health`、`POST /api/auth/login`、`POST /api/auth/2fa/verify`、`POST /api/auth/logout`、`POST /api/auth/exchange` 之外，**所有接口均需认证**。

认证通过以下任一方式提供 JWT：

| 方式 | 位置 | 值 | 推荐场景 |
|------|------|----|----------|
| 请求头 | `X-Auth-Token` | `<jwt>` | **Android 客户端首选** |
| Cookie | `auth_token` | `<jwt>` | Web 端使用 |

未携带或校验失败时：

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{ "code": 1002, "message": "未登录或会话已过期" }
```

JWT 有效期默认 24 小时（服务端 `jwt.expires_in` 配置），过期后必须重新走登录流程或使用扫码换取。

### 1.5 字段命名与时间格式

- 请求体与响应体均使用 **camelCase**。
- 时间字段一律为 **ISO 8601** 字符串，如 `"2026-05-11T09:03:21.123Z"`。
- `id` 字段：绑定为 UUID 字符串，其余资源（服务商、模型、机器、审计日志）为整型。

---

## 2. 系统接口

### 2.1 健康检查

`GET /health`

**鉴权**：无

**响应**

```json
{
  "code": 0,
  "message": "ok",
  "data": { "version": "1.0.6" }
}
```

**用途**：客户端启动时探测服务可用性、显示后端版本号。

---

## 3. 认证接口

### 3.1 账号密码登录

`POST /api/auth/login`

**鉴权**：无

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `username` | string | ✓ | 账号 |
| `password` | string | ✓ | 明文密码 |

```json
{ "username": "admin", "password": "******" }
```

**响应**

未开启 2FA、或客户端携带的信任设备 cookie 命中：

```json
{
  "code": 0,
  "data": {
    "token": "<jwt-24h>",
    "require2fa": false
  }
}
```

已开启 2FA，需进入第二步：

```json
{
  "code": 0,
  "data": {
    "require2fa": true,
    "tempToken": "<jwt-临时>"
  }
}
```

**错误码**

- `1002` 账号或密码错误
- `1003` 缺少账号或密码
- `1001` 服务端异常

> Android 端不使用浏览器 cookie，因此始终走完整 2FA 流程；获得的 `token` 应安全存储（推荐 EncryptedSharedPreferences / Keystore）。

---

### 3.2 2FA 验证码校验

`POST /api/auth/2fa/verify`

**鉴权**：无（凭 `tempToken` 鉴别）

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tempToken` | string | ✓ | 上一步返回的临时 token |
| `code` | string | ✓ | 6 位 TOTP 验证码，或 1 个 8 位恢复码 |
| `trustDevice` | boolean | ✗ | 是否将本设备标记为信任设备（Android 端建议传 `false`，依赖 token 持久化） |

**响应**

```json
{ "code": 0, "data": { "token": "<jwt-24h>" } }
```

**错误码**

- `1002` 临时 token 无效 / 验证码错误 / 用户不存在
- `1003` 缺少参数

---

### 3.3 登出

`POST /api/auth/logout`

**鉴权**：无（仅清理服务端 cookie）

**响应**

```json
{ "code": 0, "message": "已退出" }
```

> 客户端需自行清除本地存储的 token。

---

### 3.4 获取 2FA 设置信息

`GET /api/auth/2fa/setup`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": {
    "qrUrl": "otpauth://totp/...",
    "secret": "ABCDEFGHIJKLMN"
  }
}
```

`qrUrl` 是符合 [Google Authenticator Key URI](https://github.com/google/google-authenticator/wiki/Key-Uri-Format) 标准的 URI，客户端可直接生成二维码或将 `secret` 复制给用户手动添加。

---

### 3.5 启用 2FA

`POST /api/auth/2fa/enable`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | ✓ | 用户在 Authenticator App 中读取的 6 位 TOTP |

**响应**

```json
{
  "code": 0,
  "data": {
    "recoveryCodes": ["XXXX-XXXX", "YYYY-YYYY", "..."]
  }
}
```

> `recoveryCodes` 仅在此接口返回一次，客户端应**强提示用户保存**（截图/拷贝/打印），后续无法重新获取。

**错误码**

- `1002` 验证码错误
- `1003` 缺少验证码
- `1004` 尚未调用 `/api/auth/2fa/setup` 生成密钥

---

### 3.6 禁用 2FA

`POST /api/auth/2fa/disable`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `password` | string | ✓ | 当前账号密码（二次确认） |

**响应**

```json
{ "code": 0, "message": "已禁用两步验证" }
```

---

### 3.7 查询 2FA 状态

`GET /api/auth/2fa/status`

**鉴权**：✓

**响应**

```json
{ "code": 0, "data": { "enabled": true } }
```

---

### 3.8 修改密码

`POST /api/auth/change-password`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 约束 |
|------|------|------|------|
| `oldPassword` | string | ✓ | 当前密码 |
| `newPassword` | string | ✓ | 至少 6 位 |

**响应**

```json
{ "code": 0, "message": "密码已修改" }
```

**错误码**

- `1002` 旧密码错误
- `1003` 缺少字段或新密码不足 6 位

---

### 3.9 生成扫码登录短 Token

`POST /api/auth/qr-token`

**鉴权**：✓（由已登录的 Web 端发起）

**响应**

```json
{
  "code": 0,
  "data": {
    "token": "<jwt-60s>",
    "server": "https://bridge.example.com",
    "expiresIn": 60,
    "expiresAt": 1763020000000
  }
}
```

**用途**：Web 端生成二维码（一般是 JSON 包含 `token + server`），Android 客户端扫码后调 `/api/auth/exchange` 换取长 token。

---

### 3.10 扫码登录换取长 Token

`POST /api/auth/exchange`

**鉴权**：无（短 token 自鉴别）

**请求体（任选其一传递短 token）**

```json
{ "token": "<jwt-60s>" }
```

或通过请求头 `X-Auth-Token: <jwt-60s>`。

**响应**

```json
{ "code": 0, "data": { "token": "<jwt-24h>" } }
```

**错误码**

- `1002` 短 token 无效或已过期
- `1003` 缺少 token

> Android 端登录推荐流程：
> 1. 用户在登录页选择「扫码登录」
> 2. 调起摄像头扫描 Web 端生成的二维码
> 3. 解析出 `{ token, server }`，把 `server` 写入设置作为 Base URL
> 4. 用解析出的 `token` 调 `POST /api/auth/exchange` 换取长 token
> 5. 长 token 写入安全存储

---

## 4. 绑定接口（仪表盘）

> 绑定（Binding）表示一个 **CLI 进程 ↔ 飞书应用** 的映射关系，是仪表盘的核心实体。

### 4.1 查询所有绑定及状态

`GET /api/status`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "id": "f3c2a1b0-...",
      "processName": "bot-1",
      "cliKind": "cc",
      "providerId": 3,
      "modelId": 12,
      "machineId": 1,
      "machineName": "本机",
      "feishuAppId": "cli_aXXXX",
      "feishuAppSecret": "abcd****",
      "status": "online",
      "wsConnected": true,
      "provider": {
        "id": 3,
        "name": "Anthropic 官方",
        "kind": "custom",
        "baseUrl": "https://api.anthropic.com",
        "apiKey": "sk-ant...XXXX"
      },
      "model": {
        "id": 12,
        "providerId": 3,
        "modelId": "claude-opus-4-7",
        "displayName": "Claude Opus 4.7",
        "cliKind": "cc"
      },
      "createdAt": "2026-05-10T08:00:00.000Z",
      "updatedAt": "2026-05-11T09:00:00.000Z"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string (UUID) | 绑定唯一 ID |
| `processName` | string | 进程名（同时作为 tmux 会话名后缀） |
| `cliKind` | `"cc" \| "codex"` | CLI 类型 |
| `status` | `"online" \| "offline"` | tmux 会话是否存活 |
| `wsConnected` | boolean | 飞书 WebSocket 是否已连接 |
| `feishuAppSecret` | string \| null | 始终脱敏（前 4 位 + `****`） |
| `provider.apiKey` | string \| null | 始终脱敏（前 6 位 + `...` + 后 4 位） |

---

### 4.2 新建绑定（自动启动 CLI）

`POST /api/bind`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `processName` | string | ✓ | 进程名，全局唯一 |
| `cliKind` | `"cc" \| "codex"` | ✗ | 默认 `"cc"` |
| `providerId` | number | ✗ | 服务商 ID |
| `modelId` | number | ✗ | 模型 ID |
| `feishuAppId` | string | ✓ | 飞书 App ID |
| `feishuAppSecret` | string | ✓ | 飞书 App Secret |
| `machineId` | number | ✗ | 部署机器 ID，缺省为本机 |

**响应**

```json
{
  "code": 0,
  "data": { /* Binding 全量记录（feishuAppSecret 不脱敏） */ }
}
```

**错误码**

- `1003` 进程名/飞书凭据缺失，或进程名已被占用
- `1001` CLI 进程启动失败（响应 `message` 含具体原因）

> 该接口会立即在目标机器上启动 tmux 会话 + 拉起 CLI 进程 + 启动飞书 WS。失败时绑定记录会被回滚。

---

### 4.3 挂载已有会话

`POST /api/bind/mount`

**鉴权**：✓

**请求体**：与 4.2 相同。

**响应**

```json
{ "code": 0, "data": { /* Binding 记录 */ } }
```

**错误码**

- `1004` 目标 tmux 会话不存在（提示用户先手动启动 CLI）
- `1003` 进程名已被绑定 / 凭据缺失

> 适用于「已经在终端跑着的 CLI 进程」直接接管，不会重新启动进程。

---

### 4.4 编辑绑定

`POST /api/edit`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 绑定 ID |
| `feishuAppId` | string | ✗ | 留空字符串表示不修改 |
| `feishuAppSecret` | string | ✗ | 留空字符串表示不修改（保留原值） |
| `providerId` | number \| null | ✗ | `null` 表示清空 |
| `modelId` | number \| null | ✗ | `null` 表示清空 |
| `machineId` | number \| null | ✗ | `null` 表示清空 |

修改 `feishuAppId` 或 `feishuAppSecret` 会自动重启对应的飞书 WS 连接。

**响应**

```json
{ "code": 0, "data": { /* 更新后的 Binding */ } }
```

---

### 4.5 解绑

`POST /api/unbind`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✓ | 绑定 ID |
| `killProcess` | boolean | ✗ | `true` 表示同时关闭 tmux 会话 |

**响应**

```json
{ "code": 0, "message": "已解绑" }
```

---

## 5. 服务商接口

> 服务商（Provider）代表一个 AI 网关，例如 Anthropic 官方、OpenAI 官方、自建代理。
>
> - `kind = "local"`：本地 CLI（无需 baseUrl/apiKey）
> - `kind = "custom"`：自定义网关，需要 baseUrl + apiKey，创建后自动从 `<baseUrl>/v1/models` 拉取模型列表

### 5.1 列出所有服务商

`GET /api/providers`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "Anthropic 官方",
      "kind": "custom",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant...XXXX",
      "createdAt": "2026-05-10T08:00:00.000Z",
      "updatedAt": "2026-05-11T09:00:00.000Z"
    }
  ]
}
```

> `apiKey` 始终脱敏（前 6 位 + `...` + 后 4 位）。

---

### 5.2 新建服务商

`POST /api/providers`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 显示名称 |
| `kind` | `"local" \| "custom"` | ✗ | 默认 `"custom"` |
| `baseUrl` | string | `kind=custom` 时必填 | 形如 `https://api.anthropic.com`，不带 `/v1/models` |
| `apiKey` | string | `kind=custom` 时必填 | API 密钥（明文） |

**响应**

```json
{ "code": 0, "data": { /* 新建的 Provider（apiKey 不脱敏） */ } }
```

> 创建成功后服务端会异步拉取该服务商的模型列表，列表可通过 `GET /api/models?providerId=X` 查询。

---

### 5.3 编辑服务商

`PUT /api/providers/:id`

**鉴权**：✓

**路径参数**

- `:id` — 服务商 ID

**请求体**：与 5.2 相同，所有字段可选。
若改动 `baseUrl` 或 `apiKey`，会重新拉取模型列表。

**响应**

```json
{ "code": 0, "data": { /* 更新后的 Provider */ } }
```

---

### 5.4 删除服务商

`DELETE /api/providers/:id`

**鉴权**：✓

**响应**

```json
{ "code": 0, "message": "已删除" }
```

> 该服务商关联的模型记录会被级联删除。

---

## 6. 模型接口

### 6.1 查询模型列表

`GET /api/models`

**鉴权**：✓

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `providerId` | number | ✗ | 不传则返回所有模型 |

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "id": 12,
      "providerId": 3,
      "modelId": "claude-opus-4-7",
      "displayName": "Claude Opus 4.7",
      "cliKind": "cc",
      "fetchedAt": "2026-05-11T09:00:00.000Z"
    }
  ]
}
```

---

### 6.2 刷新模型列表

`POST /api/models/refresh/:providerId`

**鉴权**：✓

**响应**：与 6.1 相同的数据数组（仅含该服务商的模型）。

**错误码**

- `1003` 无效 ID / 本地服务商无法刷新
- `1004` 服务商不存在
- `1001` 第三方 API 调用失败（含超时）

---

### 6.3 修改模型 cliKind

`PUT /api/models/:id/cli-kind`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `cliKind` | `"cc" \| "codex"` | ✓ | 手动覆盖自动推断结果 |

**响应**

```json
{ "code": 0, "data": { /* 更新后的 Model */ } }
```

---

## 7. 会话接口

> 会话（Session）即目标机器上的 tmux 会话。

### 7.1 列出所有 tmux 会话

`GET /api/sessions`

**鉴权**：✓

**查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `machineId` | number | ✗ | 默认本机；指定时查询远程机器 |

**响应**

```json
{
  "code": 0,
  "data": ["bot-1", "bot-2", "codex-test"]
}
```

返回值为 tmux 会话名（去掉适配器前缀）的字符串数组。

---

### 7.2 列出未绑定的 tmux 会话

`GET /api/sessions/unbound`

**鉴权**：✓

**查询参数**：同 7.1。

**响应**：同 7.1 结构。

> 用于「挂载已有会话」页面的下拉候选。

---

## 8. 机器接口

> 机器（Machine）表示一台可部署 CLI 的远程主机。`id=1` 通常为系统内置的本机记录，不可编辑/删除。

### 8.1 列出所有机器

`GET /api/machines`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "本机",
      "host": "127.0.0.1",
      "port": 22,
      "osType": "mac",
      "osVersion": "Darwin 22.6.0",
      "authType": "password",
      "username": "root",
      "hasPassword": false,
      "hasPrivateKey": false,
      "hasPassphrase": false,
      "notes": null,
      "status": "online",
      "builtin": true,
      "lastHeartbeat": "2026-05-11T09:00:00.000Z",
      "createdAt": "2026-05-10T00:00:00.000Z",
      "updatedAt": "2026-05-11T09:00:00.000Z"
    }
  ]
}
```

> **凭据安全**：`password`、`privateKey`、`passphrase` **永远不会以明文返回**；仅返回 `hasPassword` / `hasPrivateKey` / `hasPassphrase` 三个布尔标记，`privateKey` 字段最多返回前 20 字符 + `...`。

---

### 8.2 查询单台机器

`GET /api/machines/:id`

**鉴权**：✓

**响应**：单条 Machine 记录（字段同 8.1）。

**错误码**：`1004` 机器不存在。

---

### 8.3 新建机器

`POST /api/machines`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | ✓ | 显示名称 |
| `host` | string | ✓ | IP 或域名 |
| `port` | number | ✗ | 默认 `22` |
| `osType` | `"linux" \| "mac" \| "windows"` | ✗ | 默认 `"linux"` |
| `authType` | `"password" \| "key"` | ✗ | 默认 `"password"` |
| `username` | string | ✓ | SSH 用户名 |
| `password` | string | `authType=password` 时必填 | 明文密码（服务端加密存储） |
| `privateKey` | string | `authType=key` 时必填 | OpenSSH 格式私钥 |
| `passphrase` | string | ✗ | 私钥密码 |
| `notes` | string | ✗ | 备注 |

**响应**：脱敏后的 Machine 记录。

---

### 8.4 编辑机器

`PUT /api/machines/:id`

**鉴权**：✓

**请求体**：字段与 8.3 相同，所有字段可选。

- `password` / `privateKey` / `passphrase` 传 `""`（空字符串）表示**清空原值**；不传该字段则保留原值。

**响应**：脱敏后的 Machine 记录。

**错误码**

- `1002` 本机记录（`builtin=true`）不允许修改
- `1004` 机器不存在

---

### 8.5 删除机器

`DELETE /api/machines/:id`

**鉴权**：✓

**响应**

```json
{ "code": 0, "message": "已删除" }
```

**错误码**

- `1002` 本机记录不允许删除
- `1003` 该机器仍有关联绑定，需先解绑
- `1004` 机器不存在

---

### 8.6 连接测试

`POST /api/machines/:id/test`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": {
    "ok": true,
    "hostname": "ubuntu-server",
    "os": "Linux ubuntu-server 5.15 ...",
    "tmuxVersion": "tmux 3.2a",
    "latencyMs": 142,
    "error": null
  }
}
```

- `code` 始终为 `0`；用 `data.ok` 判断是否连通。
- 失败时 `data.ok = false`，`data.error` 含失败原因。

---

### 8.7 心跳检测

`POST /api/machines/:id/heartbeat`

**鉴权**：✓

**响应**

```json
{
  "code": 0,
  "data": {
    "status": "online",
    "lastHeartbeat": "2026-05-11T09:00:00.000Z"
  }
}
```

> 建议客户端在「机器列表」页面拉新时按需调用；不要做高频心跳。

---

## 9. 日志接口

### 9.1 查询审计日志

`GET /api/logs`

**鉴权**：✓

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `limit` | number | ✗ | 100 | 最大 500 |
| `action` | string | ✗ | — | 按操作类型过滤，如 `bind_create` |

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "id": 1024,
      "userId": 1,
      "action": "bind_create",
      "target": "bot-1",
      "detail": "cliKind=cc, feishuAppId=cli_aXXXX, machineId=1",
      "ipAddress": "10.0.0.5",
      "createdAt": "2026-05-11T08:55:00.000Z"
    }
  ]
}
```

常见 `action`：`bind_create` / `bind_mount` / `bind_edit` / `bind_delete` / `machine_create` / `machine_update` / `machine_delete` / `machine_test`。

---

### 9.2 查询系统日志

`GET /api/logs/system`

**鉴权**：✓

**查询参数**

| 参数 | 类型 | 必填 | 默认 | 说明 |
|------|------|------|------|------|
| `limit` | number | ✗ | 200 | 最大 1000 |

**响应**

```json
{
  "code": 0,
  "data": [
    {
      "time": "2026-05-11T09:00:00.000Z",
      "level": "info",
      "msg": "用户 admin 登录",
      "extra": []
    }
  ]
}
```

无法解析为 JSON 的旧行会以 `{ "raw": "原始文本" }` 返回，客户端需做兜底显示。

---

### 9.3 实时日志推送（SSE）

`GET /api/logs/stream`

**鉴权**：✓（**通过 query 或 header 携带 token**）

**协议**：[Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

**调用方式**

由于 SSE 客户端通常不便加请求头，本端点支持 query token：

```
GET /api/logs/stream?token=<jwt>
```

或使用请求头：

```
X-Auth-Token: <jwt>
```

**响应**

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

**事件流格式**

- 连接建立时回放最近 200 行历史日志，每条作为独立 `data:` 事件
- 之后每条新日志推一条 `data:` 事件
- 每 25 秒推一行 `:hb` 心跳（无 data 字段，仅注释，客户端可忽略）

```
data: {"time":"2026-05-11T09:00:00.000Z","level":"info","msg":"..."}

data: {"time":"2026-05-11T09:00:01.000Z","level":"warn","msg":"..."}

:hb

```

**鉴权失败**：返回 `HTTP 401 + plain text "Unauthorized"`。

> **Android 实现建议**：使用 OkHttp + `EventSource` 扩展，或直接用 `OkHttpClient.newCall(...).execute()` 读取 `ResponseBody.source()` 逐行解析。注意：
> - 关闭流时务必 `cancel()` 当前请求，否则 tail 进程会驻留服务端直到 TCP 超时
> - 网络断开后需重连，重连建议加 1～10 秒退避

---

## 10. 设置接口

### 10.1 读取对外服务地址

`GET /api/settings/external-url`

**鉴权**：✓

**响应**

```json
{ "code": 0, "data": { "externalUrl": "https://bridge.example.com" } }
```

未配置时 `externalUrl` 为 `""`。

---

### 10.2 保存对外服务地址

`PUT /api/settings/external-url`

**鉴权**：✓

**请求体**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `externalUrl` | string | ✓ | 必须以 `http://` 或 `https://` 开头；空字符串表示清空 |

**响应**

```json
{ "code": 0, "data": { "externalUrl": "https://bridge.example.com" } }
```

**错误码**

- `1003` 地址格式错误

---

## 11. 附录 — 数据模型

下列 TypeScript 类型与 [`src/shared/types.ts`](../src/shared/types.ts) 保持一致，可作为 Android 端建立 Kotlin/Java DTO 的参考。

```typescript
type CliKind = 'cc' | 'codex';
type ProviderKind = 'local' | 'custom';

interface Provider {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string | null;
  apiKey: string | null;       // 列表接口脱敏；创建/更新接口返回明文
  createdAt: string;           // ISO 8601
  updatedAt: string;
}

interface Model {
  id: number;
  providerId: number;
  modelId: string;             // 第三方模型 ID，例如 "claude-opus-4-7"
  displayName: string | null;
  cliKind: CliKind;
  fetchedAt: string;
}

interface Binding {
  id: string;                  // UUID
  processName: string;
  cliKind: CliKind;
  providerId: number | null;
  modelId: number | null;
  machineId: number | null;
  machineName: string | null;
  feishuAppId: string | null;
  feishuAppSecret: string | null;  // 列表接口脱敏 "abcd****"
  status: 'online' | 'offline';
  wsConnected: boolean;
  provider?: Provider;
  model?: Model;
  createdAt: string;
  updatedAt: string;
}

interface Machine {
  id: number;
  name: string;
  host: string;
  port: number;
  osType: 'linux' | 'mac' | 'windows';
  osVersion: string | null;
  authType: 'password' | 'key';
  username: string;
  hasPassword: boolean;        // 凭据存在标记（永不返回明文）
  hasPrivateKey: boolean;
  hasPassphrase: boolean;
  notes: string | null;
  status: 'online' | 'offline' | 'unknown';
  builtin: boolean;
  lastHeartbeat: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  id: number;
  userId: number | null;
  action: string;              // 如 bind_create / machine_update
  target: string;              // 操作对象（进程名 / 机器 ID 等）
  detail: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface SystemLogEntry {
  time?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  msg?: string;
  extra?: unknown[];
  raw?: string;                // 无法解析为 JSON 时的兜底字段
}
```

---

## 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-05-11 | v1.0.6 | 首版文档发布，覆盖系统/认证/绑定/服务商/模型/会话/机器/日志/设置全部接口 |
