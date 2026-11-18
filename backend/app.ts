import express, { type NextFunction, type Request, type Response } from 'express';
import { apiRouter } from './routes/api.ts';
import { backendLogger } from './services/logger.ts';

export function createApiApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    next();
  });

  app.use(express.json({ limit: '512kb' }));

  app.use('/api', apiRouter);

  app.use('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Centralized JSON error handler for malformed payloads or uncaught route errors
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    backendLogger.error('API', 'UNHANDLED_ROUTE_ERROR', `${req.method} ${req.path}: ${message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  });

  return app;
}
