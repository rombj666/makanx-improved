import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Express } from 'express';

export const configureSecurity = (app: Express) => {
  // Helmet for security headers
  app.use(helmet());

  // Rate limiting for general API endpoints
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
  });

  // Stricter rate limiting for auth sensitive actions (login, register, password reset)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // Limit each IP to 20 login/register attempts per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later.' }
  });

  // Stricter rate limiting for webhooks
  const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // Limit each IP to 60 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Apply general API limiter to all /api/
  app.use('/api/', apiLimiter);

  // Apply stricter limiter ONLY to sensitive auth routes
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/register', authLimiter);
  app.use('/api/auth/password/reset/*', authLimiter);
  app.use('/api/auth/invite/accept', authLimiter);

  // Note: /api/auth/me is now under apiLimiter (100 per 15 mins), which is safe.
  
  app.use('/api/webhooks/', webhookLimiter);
};
