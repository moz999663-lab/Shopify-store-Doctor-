import { Router, Request, Response } from 'express';
import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { AppError } from '../middleware/error-handler';

const router = Router();

// الحصول على جميع التشخيصات
router.get('/list/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;
    const { status, type, sortBy } = req.query;

    let query = database
      .selectFrom('diagnostics')
      .selectAll()
      .where('shop_id', '=', shopId);

    if (status) {
      query = query.where('status', '=', status as string);
    }

    if (type) {
      query = query.where('type', '=', type as string);
    }

    const sortColumn = (sortBy as string) || 'priority_score';
    query = query.orderBy(sortColumn, 'desc');

    const diagnostics = await query.execute();

    res.json({
      total: diagnostics.length,
      critical: diagnostics.filter(d => d.finding_type === 'critical').length,
      warning: diagnostics.filter(d => d.finding_type === 'warning').length,
      opportunity: diagnostics.filter(d => d.finding_type === 'opportunity').length,
      diagnostics
    });
  } catch (error) {
    next(error);
  }
});

// الحصول على تشخيص معين
router.get('/detail/:diagnosticId', async (req: Request, res: Response, next) => {
  try {
    const { diagnosticId } = req.params;

    const diagnostic = await database
      .selectFrom('diagnostics')
      .selectAll()
      .where('id', '=', diagnosticId)
      .executeTakeFirst();

    if (!diagnostic) {
      throw new AppError(404, 'التشخيص غير موجود', 'DIAGNOSTIC_NOT_FOUND');
    }

    // جلب التوصيات المتعلقة
    const recommendations = await database
      .selectFrom('recommendations')
      .selectAll()
      .where('diagnostic_id', '=', diagnosticId)
      .execute();

    res.json({
      diagnostic,
      recommendations
    });
  } catch (error) {
    next(error);
  }
});

// الحصول على ملخص صحة المتجر
router.get('/health-score/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    // جلب جميع التشخيصات النشطة
    const activeDiagnostics = await database
      .selectFrom('diagnostics')
      .selectAll()
      .where('shop_id', '=', shopId)
      .where('status', '=', 'active')
      .execute();

    // حساب درجة الصحة
    let healthScore = 100;
    let criticalIssues = 0;
    let warningIssues = 0;

    for (const diagnostic of activeDiagnostics) {
      switch (diagnostic.finding_type) {
        case 'critical':
          healthScore -= 20;
          criticalIssues++;
          break;
        case 'warning':
          healthScore -= 10;
          warningIssues++;
          break;
      }
    }

    healthScore = Math.max(0, healthScore);

    const healthStatus = 
      healthScore >= 80 ? 'ممتاز' :
      healthScore >= 60 ? 'جيد' :
      healthScore >= 40 ? 'متوسط' :
      'ضعيف';

    res.json({
      health_score: healthScore,
      health_status: healthStatus,
      total_issues: activeDiagnostics.length,
      critical_issues: criticalIssues,
      warning_issues: warningIssues,
      opportunity_count: activeDiagnostics.filter(d => d.finding_type === 'opportunity').length,
      info_count: activeDiagnostics.filter(d => d.finding_type === 'info').length
    });
  } catch (error) {
    next(error);
  }
});

export { router as diagnosticRoutes };
