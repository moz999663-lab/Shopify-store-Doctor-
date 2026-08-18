import { Router, Request, Response } from 'express';
import { logger } from '../infrastructure/logger';
import { database } from '../infrastructure/database';
import { SyncService } from '../services/sync.service';
import { ShopifyService } from '../services/shopify.service';
import { AppError } from '../middleware/error-handler';

const router = Router();

// الحصول على حالة المزامنة
router.get('/status/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    // الحصول على آخر مزامنة
    const lastSync = await database
      .selectFrom('sync_jobs')
      .selectAll()
      .where('shop_id', '=', shopId)
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();

    res.json({
      status: lastSync?.status || 'never',
      lastSync,
      message: lastSync ? `آخر مزامنة: ${lastSync.created_at}` : 'لم تتم مزامنة بعد'
    });
  } catch (error) {
    next(error);
  }
});

// بدء مزامنة كاملة
router.post('/full/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    // الحصول على بيانات المتجر
    const shop = await database
      .selectFrom('shops')
      .selectAll()
      .where('id', '=', shopId)
      .executeTakeFirst();

    if (!shop) {
      throw new AppError(404, 'المتجر غير موجود', 'SHOP_NOT_FOUND');
    }

    if (!shop.is_active) {
      throw new AppError(400, 'المتجر غير مفعل', 'SHOP_INACTIVE');
    }

    // بدء المزامنة بشكل غير متزامن
    const shopifyService = new ShopifyService(shop.shop_url, shop.access_token);
    const syncService = new SyncService(shopId, shopifyService);

    // لا ننتظر انتهاء المزامنة
    syncService.performFullSync().catch(error => {
      logger.error(`❌ خطأ في المزامنة الكاملة: ${shopId}`, error);
    });

    res.json({
      message: '✅ تم بدء المزامنة الكاملة',
      shopId,
      status: 'started'
    });
  } catch (error) {
    next(error);
  }
});

// بدء مزامنة متزايدة
router.post('/incremental/:shopId', async (req: Request, res: Response, next) => {
  try {
    const { shopId } = req.params;

    // الحصول على بيانات المتجر
    const shop = await database
      .selectFrom('shops')
      .selectAll()
      .where('id', '=', shopId)
      .executeTakeFirst();

    if (!shop) {
      throw new AppError(404, 'المتجر غير موجود', 'SHOP_NOT_FOUND');
    }

    if (!shop.is_active) {
      throw new AppError(400, 'المتجر غير مفعل', 'SHOP_INACTIVE');
    }

    // بدء المزامنة بشكل غير متزامن
    const shopifyService = new ShopifyService(shop.shop_url, shop.access_token);
    const syncService = new SyncService(shopId, shopifyService);

    syncService.performIncrementalSync().catch(error => {
      logger.error(`❌ خطأ في المزامنة المتزايدة: ${shopId}`, error);
    });

    res.json({
      message: '✅ تم بدء المزامنة المتزايدة',
      shopId,
      status: 'started'
    });
  } catch (error) {
    next(error);
  }
});

export { router as syncRoutes };
