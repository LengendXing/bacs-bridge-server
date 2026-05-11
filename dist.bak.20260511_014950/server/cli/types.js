/**
 * @module cli/types
 * @description CLI Adapter 接口定义
 *
 * 所有 CLI 后端（Claude Code / Codex / 未来 Gemini CLI 等）必须实现此接口。
 * bridge 主流程只跟 CliAdapter 打交道，不感知具体 CLI 的输入输出细节。
 */
export {};
