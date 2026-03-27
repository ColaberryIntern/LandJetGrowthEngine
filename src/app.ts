import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { testConnection } from './config/database';
import { requestIdMiddleware } from './middleware/requestId';
import { apiLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import notificationRoutes from './routes/notifications';
import leadRoutes from './routes/admin/leadRoutes';
import campaignRoutes from './routes/admin/campaignRoutes';
import mandrillWebhook from './routes/webhooks/mandrillWebhook';
import ceoIntroRoutes from './routes/admin/ceoIntroRoutes';

export function createApp() {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Request ID tracking
  app.use(requestIdMiddleware);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Request logging (skip in test)
  if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
  }

  // Rate limiting on API routes
  app.use('/api/', apiLimiter);

  // Health check endpoint (no auth required)
  app.get('/api/health', async (_req: Request, res: Response) => {
    const dbConnected = await testConnection();
    const status = dbConnected ? 'ok' : 'degraded';
    const httpStatus = dbConnected ? 200 : 503;

    res.status(httpStatus).json({
      status,
      db: dbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/admin/leads', leadRoutes);
  app.use('/api/admin/campaigns', campaignRoutes);
  app.use('/api/webhooks/mandrill', mandrillWebhook);
  app.use('/api/admin/ceo-intro', ceoIntroRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      code: 'ROUTE_NOT_FOUND',
    });
  });

  // Global error handler
  app.use(errorHandler);

  return app;
}
