/**
 * @module routes/logs
 * @description Log viewer route stub (Phase 2 implementation target).
 *
 * Provides a skeleton endpoint for retrieving recent structured log
 * entries.  The full implementation will read from the daily log files
 * produced by the logger middleware and return the last N entries.
 */

import { Router } from 'express';
import type { ApiResponse } from '@shared/types.js';
import { ErrorCode } from '@shared/constants.js';

const router = Router();

/**
 * `GET /api/logs`
 *
 * Stub — will be implemented in Phase 2.
 * Future behaviour: read today's log file, parse each JSON-line entry,
 * and return the most recent 100 entries (or a configurable limit).
 *
 * @returns `ApiResponse` with an empty data array.
 */
router.get('/api/logs', (_req, res) => {
  const body: ApiResponse<unknown[]> = {
    code: ErrorCode.SUCCESS,
    message: 'ok',
    data: [],
  };
  res.json(body);
});

export default router;
