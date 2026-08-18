import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from '../types/database';
import { logger } from './logger';

const dialect = new PostgresDialect({
  pool: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10
  })
});

export const database = new Kysely<Database>({
  dialect
});

export const db = {
  async connect() {
    try {
      await database.selectFrom('information_schema.tables').selectAll().limit(1).execute();
      logger.info('✅ اتصال قاعدة البيانات نجح');
    } catch (error) {
      logger.error('❌ فشل الاتصال بقاعدة البيانات:', error);
      throw error;
    }
  },

  async disconnect() {
    await database.destroy();
  },

  getInstance() {
    return database;
  }
};
