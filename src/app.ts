import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './infrastructure/logger';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { authRoutes } from './routes/auth.routes';
import { healthRoutes } from './routes/health.routes';
import { syncRoutes } from './routes/sync.routes';
import { webhookRoutes } from './routes/webhook.routes';
import { profitRoutes } from './routes/profit.routes';
import { diagnosticRoutes } from './routes/diagnostic.routes';

export async function initializeApp() {
  const app = express();

  // Middleware الأمان
  app.use(helmet());
  app.use(cors({
    origin: process.env.NODE_ENV === 'development' ? '*' : process.env.FRONTEND_URL,
    credentials: true
  }));

  // Middleware لتحليل البيانات
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ limit: '10mb', extended: true }));

  // Middleware للتسجيل
  app.use(requestLogger);

  // المسارات
  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/sync', syncRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/profit', profitRoutes);
  app.use('/api/diagnostics', diagnosticRoutes);

  // معالج الأخطاء (يجب أن يكون آخر middleware)
  app.use(errorHandler);

  return app;
}
