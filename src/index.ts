import { initializeApp } from './app';
import { logger } from './infrastructure/logger';
import { db } from './infrastructure/database';

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  try {
    logger.info('🚀 بدء تشغيل دكتور الأرباح من Shopify...');
    
    // تهيئة قاعدة البيانات
    logger.info('📦 الاتصال بقاعدة البيانات...');
    await db.connect();
    logger.info('✅ تم الاتصال بقاعدة البيانات بنجاح');
    
    // تهيئة التطبيق
    const app = await initializeApp();
    
    // بدء الخادم
    app.listen(PORT, () => {
      logger.info(`🌐 الخادم قيد التشغيل على المنفذ ${PORT}`);
      logger.info(`📍 الرابط: http://localhost:${PORT}`);
    });
  } catch (error) {
    logger.error('❌ خطأ في بدء التطبيق:', error);
    process.exit(1);
  }
}

bootstrap();
