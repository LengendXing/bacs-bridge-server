import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listAllSessions, listUnboundSessions } from '../session/manager.js';

const router = Router();

router.get('/api/sessions', requireAuth, async (req, res) => {
  const machineId = req.query.machineId ? Number(req.query.machineId) : undefined;
  const sessions = await listAllSessions(machineId);
  res.json({ code: 0, data: sessions });
});

router.get('/api/sessions/unbound', requireAuth, async (req, res) => {
  const machineId = req.query.machineId ? Number(req.query.machineId) : undefined;
  const unbound = await listUnboundSessions(machineId);
  res.json({ code: 0, data: unbound });
});

export default router;
