import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Express } from 'express';

export const configureSecurity = (app: Express) => {
  // Helmet for security headers
  app.use(helmet());

  // Rate limiting for general API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5000, // Increased further to handle shared IPs and SPA navigation
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
    handler: (req, res, next, options) => {
      console.warn(`[rate-limit] General limit reached: ${req.ip} -> ${req.originalUrl}`);
      res.status(options.statusCode).send(options.message);
    }
  });

  // Stricter rate limiting for auth sensitive actions (login and password reset)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Increased for shared IPs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' },
    handler: (req, res, next, options) => {
      console.warn(`[rate-limit] Auth limit reached: ${req.ip} -> ${req.originalUrl}`);
      res.status(options.statusCode).send(options.message);
    }
  });

  // Stricter rate limiting for webhooks
  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply stricter limiter ONLY to sensitive auth routes FIRST
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/password/reset/*', authLimiter);

  // Apply general API limiter to all other /api/ routes
  // We use a custom middleware wrapper to avoid double-counting on auth routes
  app.use('/api/', (req, res, next) => {
    const authRoutes = [
      '/api/auth/login',
      '/api/auth/password/reset/',
    ];
    if (authRoutes.some(route => req.originalUrl.startsWith(route))) {
      return next();
    }
    apiLimiter(req, res, next);
  });

  app.use('/api/webhooks/', webhookLimiter);
};
