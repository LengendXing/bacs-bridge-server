/**
 * @module routes/sessions
 * @description Session management route stubs (Phase 2 implementation target).
 *
 * Provides skeleton endpoints for listing tmux sessions and finding
 * unbound sessions that are available for mounting.  Full implementation
 * will arrive in Phase 2 alongside the binding management module.
 */

import { Router } from 'express';
import type { ApiResponse } from '@shared/types.js';
import { ErrorCode } from '@shared/constants.js';

const router = Router();

/**
 * `GET /api/sessions`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: return a list of all tmux session names currently
 * visible to the bridge process.
 *
 * @returns `ApiResponse` with an empty data array.
 */
router.get('/api/sessions', (_req, res) => {
  const body: ApiResponse<string[]> = {
    code: ErrorCode.SUCCESS,
    message: 'ok',
    data: [],
  };
  res.json(body);
});

/**
 * `GET /api/sessions/unbound`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: return tmux session names that are NOT currently
 * associated with a binding, useful for the "mount existing process"
 * UI flow.
 *
 * @returns `ApiResponse` with an empty data array.
 */
router.get('/api/sessions/unbound', (_req, res) => {
  const body: ApiResponse<string[]> = {
    code: ErrorCode.SUCCESS,
    message: 'ok',
    data: [],
  };
  res.json(body);
});

export default router;
