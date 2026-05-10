/**
 * @module routes/bindings
 * @description Binding management route stubs (Phase 2-3 implementation target).
 *
 * Provides skeleton endpoints for listing, creating, mounting, editing,
 * and unbinding CLI process ↔ Feishu-app associations.  All routes
 * currently return stub responses.  Full CRUD with WebSocket lifecycle
 * management will be built in Phase 2-3.
 */

import { Router } from 'express';
import type { ApiResponse } from '@shared/types.js';
import { ErrorCode } from '@shared/constants.js';

const router = Router();

/**
 * `GET /api/status`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: return all bindings with their current online/offline
 * status and WebSocket connection state.
 *
 * @returns `ApiResponse` with an empty data array.
 */
router.get('/api/status', (_req, res) => {
  const body: ApiResponse<unknown[]> = {
    code: ErrorCode.SUCCESS,
    message: 'ok',
    data: [],
  };
  res.json(body);
});

/**
 * `POST /api/bind`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: create a new binding, start a CLI process in tmux,
 * and open a WebSocket connection to Feishu.
 *
 * @returns `ApiResponse` with error code 1003 (not implemented).
 */
router.post('/api/bind', (_req, res) => {
  const body: ApiResponse = {
    code: ErrorCode.PARAM_ERROR,
    message: '绑定模块未实现',
  };
  res.json(body);
});

/**
 * `POST /api/bind/mount`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: attach a Feishu app to an *existing* tmux session
 * without creating a new CLI process.
 *
 * @returns `ApiResponse` with error code 1003 (not implemented).
 */
router.post('/api/bind/mount', (_req, res) => {
  const body: ApiResponse = {
    code: ErrorCode.PARAM_ERROR,
    message: '绑定模块未实现',
  };
  res.json(body);
});

/**
 * `POST /api/edit`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: update a binding's Feishu credentials or CLI mode,
 * then restart the associated WebSocket connection.
 *
 * @returns `ApiResponse` with error code 1003 (not implemented).
 */
router.post('/api/edit', (_req, res) => {
  const body: ApiResponse = {
    code: ErrorCode.PARAM_ERROR,
    message: '绑定模块未实现',
  };
  res.json(body);
});

/**
 * `POST /api/unbind`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: remove a binding, optionally kill the tmux process,
 * and close the WebSocket connection.
 *
 * @returns `ApiResponse` with error code 1003 (not implemented).
 */
router.post('/api/unbind', (_req, res) => {
  const body: ApiResponse = {
    code: ErrorCode.PARAM_ERROR,
    message: '绑定模块未实现',
  };
  res.json(body);
});

export default router;
