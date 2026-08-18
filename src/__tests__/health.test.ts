import { initializeApp } from '../app';
import request from 'supertest';

describe('Health Route', () => {
  let app: any;

  beforeAll(async () => {
    app = await initializeApp();
  });

  it('should return health status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBeDefined();
  });
});
