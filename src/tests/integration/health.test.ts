import { createApp } from '../../app';
import express from 'express';

// Mock the database connection for health check tests
jest.mock('../../config/database', () => ({
  testConnection: jest.fn(),
  getSequelize: jest.fn(),
  closeConnection: jest.fn(),
}));

import { testConnection } from '../../config/database';

const mockedTestConnection = testConnection as jest.MockedFunction<typeof testConnection>;

describe('Health Check Endpoint', () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp();
  });

  it('should return 200 with status ok when DB is connected', async () => {
    mockedTestConnection.mockResolvedValue(true);

    const response = await makeRequest(app, '/api/health');

    expect(response.status).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeDefined();
  });

  it('should return 503 with status degraded when DB is disconnected', async () => {
    mockedTestConnection.mockResolvedValue(false);

    const response = await makeRequest(app, '/api/health');

    expect(response.status).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('degraded');
    expect(body.db).toBe('disconnected');
  });

  it('should return 404 for unknown routes', async () => {
    const response = await makeRequest(app, '/api/nonexistent');

    expect(response.status).toBe(404);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Not Found');
    expect(body.code).toBe('ROUTE_NOT_FOUND');
  });
});

// Simple test helper to make requests without supertest
function makeRequest(
  app: express.Express,
  path: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const http = require('http');
    const server = http.createServer(app);

    server.listen(0, () => {
      const port = server.address().port;
      http.get(`http://localhost:${port}${path}`, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body: data });
        });
      }).on('error', (err: Error) => {
        server.close();
        reject(err);
      });
    });
  });
}
