import { createClient } from 'redis';
import { logger } from './logger';

let client: ReturnType<typeof createClient> | null = null;

export async function initializeRedis() {
  try {
    client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    client.on('error', (err) => logger.error('Redis Error:', err));
    client.on('connect', () => logger.info('✅ Redis متصل'));

    await client.connect();
    return client;
  } catch (error) {
    logger.error('❌ فشل الاتصال بـ Redis:', error);
    throw error;
  }
}

export function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized');
  }
  return client;
}
