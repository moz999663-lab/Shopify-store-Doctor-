import { Router, Request, Response } from 'express';
import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { ProfitService } from '../services/profit.service';
import { AppError } from '../middleware/error-handler';

const router = Router();

// الحصول على المقاييس اليومية
router.get('/metrics/daily/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;
    const { date } = req.query;

    const targetDate = date ? new Date(date as string) : new Date();
    targetDate.setHours(0, 0, 0, 0);

    const metrics = await database
      .selectFrom('metric_snapshots')
      .selectAll()
      .where('shop_id', '=', shopId)
      .where('date', '=', targetDate)
      .executeTakeFirst();

    if (!metrics) {
      throw new AppError(404, 'لا توجد مقاييس للتاريخ المطلوب', 'METRICS_NOT_FOUND');
    }

    res.json({
      date: targetDate.toISOString(),
      metrics
    });
  } catch (error) {
    next(error);
  }
});

// الحصول على مقاييس فترة زمنية
router.get('/metrics/period/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;
    const { startDate, endDate, periodType } = req.query;

    if (!startDate || !endDate) {
      throw new AppError(400, 'التواريخ مطلوبة', 'MISSING_DATES');
    }

    const profitService = new ProfitService(shopId);
    const metrics = await profitService.calculatePeriodMetrics(
      new Date(startDate as string),
      new Date(endDate as string),
      (periodType as any) || 'daily'
    );

    res.json({
      startDate,
      endDate,
      periodType: periodType || 'daily',
      metrics
    });
  } catch (error) {
    next(error);
  }
});

// حساب ربحية المنتجات
router.get('/profitability/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    const profitService = new ProfitService(shopId);
    const profitability = await profitService.calculateProductProfitability();

    res.json({
      total_products: profitability.length,
      profitable_products: profitability.filter(p => p.is_profitable).length,
      unprofitable_products: profitability.filter(p => !p.is_profitable).length,
      products: profitability
    });
  } catch (error) {
    next(error);
  }
});

// تحليل تأثير الخصومات
router.get('/discount-analysis/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    const profitService = new ProfitService(shopId);
    const analysis = await profitService.analyzeDiscountImpact();

    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

// تحليل تأثير الاسترجاعات
router.get('/refund-analysis/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    const profitService = new ProfitService(shopId);
    const analysis = await profitService.analyzeRefundImpact();

    res.json(analysis);
  } catch (error) {
    next(error);
  }
});

// بدء حساب المقاييس اليومية
router.post('/calculate-daily/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;
    const { date } = req.body;

    const profitService = new ProfitService(shopId);
    const targetDate = date ? new Date(date) : new Date();

    // بدء الحساب بدون الانتظار
    profitService.calculateDailyMetrics(targetDate).catch(error => {
      logger.error(`خطأ في حساب المقاييس اليومية: ${shopId}`, error);
    });

    res.json({
      status: 'started',
      message: 'بدأ حساب المقاييس اليومية',
      date: targetDate.toISOString()
    });
  } catch (error) {
    next(error);
  }
});

export { router as profitRoutes };
