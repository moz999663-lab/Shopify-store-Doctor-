import { Router, Request, Response } from 'express';
import { logger } from '../infrastructure/logger';
import { WebhookService } from '../services/webhook.service';
import { AppError } from '../middleware/error-handler';

const router = Router();

// middleware للحصول على raw body
router.use((req: Request, res: Response, next) => {
  let data = '';
  req.on('data', chunk => {
    data += chunk;
  });
  req.on('end', () => {
    req.rawBody = data;
    next();
  });
});

// Webhook: Order Created
router.post('/orders/create', async (req: Request, res: Response, next) => {
  try {
    const shopId = req.headers['x-shopify-shop-id'] as string;
    const order = req.body;

    if (!shopId) {
      throw new AppError(400, 'Shop ID مفقود', 'MISSING_SHOP_ID');
    }

    logger.info(`📦 Webhook: طلب جديد من المتجر ${shopId}`);

    await WebhookService.handleOrderCreated(shopId, order);

    res.json({ status: 'received' });
  } catch (error) {
    logger.error('❌ خطأ في معالجة webhook:', error);
    next(error);
  }
});

// Webhook: Order Updated
router.post('/orders/updated', async (req: Request, res: Response, next) => {
  try {
    const shopId = req.headers['x-shopify-shop-id'] as string;
    const order = req.body;

    if (!shopId) {
      throw new AppError(400, 'Shop ID مفقود', 'MISSING_SHOP_ID');
    }

    logger.info(`📦 Webhook: تحديث طلب من المتجر ${shopId}`);

    await WebhookService.handleOrderUpdated(shopId, order);

    res.json({ status: 'received' });
  } catch (error) {
    logger.error('❌ خطأ في معالجة webhook:', error);
    next(error);
  }
});

// Webhook: Refund Created
router.post('/refunds/create', async (req: Request, res: Response, next) => {
  try {
    const shopId = req.headers['x-shopify-shop-id'] as string;
    const refund = req.body;
    const orderId = req.headers['x-shopify-order-id'] as string;

    if (!shopId || !orderId) {
      throw new AppError(400, 'معرفات مفقودة', 'MISSING_IDS');
    }

    logger.info(`💸 Webhook: استرجاع جديد من المتجر ${shopId}`);

    await WebhookService.handleRefundCreated(shopId, refund, orderId);

    res.json({ status: 'received' });
  } catch (error) {
    logger.error('❌ خطأ في معالجة webhook:', error);
    next(error);
  }
});

// Webhook: Product Updated
router.post('/products/update', async (req: Request, res: Response, next) => {
  try {
    const shopId = req.headers['x-shopify-shop-id'] as string;
    const product = req.body;

    if (!shopId) {
      throw new AppError(400, 'Shop ID مفقود', 'MISSING_SHOP_ID');
    }

    logger.info(`📦 Webhook: تحديث منتج من المتجر ${shopId}`);

    await WebhookService.handleProductUpdated(shopId, product);

    res.json({ status: 'received' });
  } catch (error) {
    logger.error('❌ خطأ في معالجة webhook:', error);
    next(error);
  }
});

export { router as webhookRoutes };
