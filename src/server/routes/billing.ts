/**
 * @module routes/billing
 * @description 计费查询 API
 *
 * 提供三个端点：
 * 1. GET /api/billing         — 分页查询计费记录
 * 2. GET /api/billing/summary — 费用汇总统计
 * 3. GET /api/billing/:id     — 单条记录详情
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as billing from '../billing/service.js';

const router = Router();

/**
 * GET /api/billing
 *
 * 分页查询计费记录
 * Query params: page, pageSize, processName, modelId, startDate, endDate
 */
router.get('/api/billing', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
  const pageSize = Math.min(Math.max(1, parseInt(req.query.pageSize as string, 10) || 20), 100);
  const processName = (req.query.processName as string | undefined)?.toString();
  const modelId = (req.query.modelId as string | undefined)?.toString();
  const startDate = (req.query.startDate as string | undefined)?.toString();
  const endDate = (req.query.endDate as string | undefined)?.toString();

  try {
    const result = billing.queryBillingRecords({
      page, pageSize, processName, modelId, startDate, endDate,
    });
    res.json({ code: 0, data: result });
  } catch (e: any) {
    res.json({ code: 1003, message: e.message });
  }
});

/**
 * GET /api/billing/summary
 *
 * 费用汇总统计
 */
router.get('/api/billing/summary', requireAuth, (_req, res) => {
  try {
    const summary = billing.getBillingSummary();
    res.json({ code: 0, data: summary });
  } catch (e: any) {
    res.json({ code: 1003, message: e.message });
  }
});

/**
 * GET /api/billing/:id
 *
 * 单条计费记录详情（含明细 + 对话关联）
 */
router.get('/api/billing/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (!Number.isFinite(id) || id < 1) {
    res.json({ code: 1003, message: '无效的 ID' });
    return;
  }

  try {
    const detail = billing.getBillingDetail(id);
    if (!detail.record) {
      res.json({ code: 1004, message: '记录不存在' });
      return;
    }
    res.json({ code: 0, data: detail });
  } catch (e: any) {
    res.json({ code: 1003, message: e.message });
  }
});

export default router;
