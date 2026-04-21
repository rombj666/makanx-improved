import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { initSocket } from './socket';
import authRoutes from './routes/auth.routes';
import eventRoutes from './routes/event.routes';
import boothRoutes from './routes/booth.routes';
import applicationRoutes from './routes/application.routes';
import orderRoutes from './routes/order.routes';
import organizerRoutes from './routes/organizer.routes';
import organizerUploadRoutes from './routes/organizerUploadRoutes';
import uploadRoutes from './routes/upload.routes';
import menuRoutes from './routes/menu.routes';
import pushRoutes from './routes/push.routes';
import analyticsRoutes from './routes/analytics.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import vendorRoutes from './routes/vendor.routes';
import hourCoffeeTestEmailRoutes from './routes/hour-coffee-test-email.routes';
import webpush from 'web-push';

import { configureSecurity } from './middleware/security';

dotenv.config();

export const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3001;

// Init Socket.IO
initSocket(httpServer);

// Security Middleware
app.set('trust proxy', 1); // Trust first proxy (Railway/Render/Load Balancers)

const stripQuotes = (s: string) => s.replace(/^['"`]+|['"`]+$/g, '');
const normalizeOrigin = (s: string) => stripQuotes(s.trim()).replace(/\/+$/, '');
const parseOriginList = (raw: unknown) => {
  const input = typeof raw === 'string' ? raw : '';
  return input
    .split(/[,\s]+/g)
    .map((x) => normalizeOrigin(x))
    .filter(Boolean);
};

const originsFromEnv = [
  ...parseOriginList(process.env.CORS_ORIGIN),
  ...parseOriginList(process.env.CLIENT_URL),
].filter(Boolean);

const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
const defaultDevOrigins = isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];

const allowedOrigins = Array.from(new Set([...originsFromEnv, ...defaultDevOrigins].map(normalizeOrigin)));
const allowAllOrigins = allowedOrigins.includes('*');

console.log('[cors] allowed origins', { allowAll: allowAllOrigins, origins: allowedOrigins.filter((o) => o !== '*') });

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const cleaned = normalizeOrigin(origin);
    if (allowAllOrigins) return cb(null, true);
    if (allowedOrigins.includes(cleaned)) return cb(null, cleaned);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

configureSecurity(app);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.originalUrl} - IP: ${req.ip} - Forwarded: ${req.headers['x-forwarded-for']}`);
  next();
});

import path from 'path';

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

const vapidSubject = process.env.VAPID_EMAIL || process.env.VAPID_SUBJECT || '';
const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
if (vapidSubject && vapidPublic && vapidPrivate) {
  try {
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
    console.log('[push] VAPID configured:', {
      subject: vapidSubject,
      publicKeyLen: vapidPublic.length,
      privateKeyLen: vapidPrivate.length,
    });
  } catch (err: any) {
    console.error('[push] VAPID configuration error:', err?.message || err);
  }
} else {
  console.warn('[push] VAPID missing:', {
    hasSubject: !!vapidSubject,
    hasPublic: !!vapidPublic,
    hasPrivate: !!vapidPrivate,
  });
}

// Routes
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/events', eventRoutes);
apiRouter.use('/booths', boothRoutes);
apiRouter.use('/applications', applicationRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/organizer', organizerRoutes);
apiRouter.use('/organizer', organizerUploadRoutes);
apiRouter.use('/uploads', uploadRoutes);
apiRouter.use('/menu-items', menuRoutes);
apiRouter.use('/push', pushRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/whatsapp', whatsappRoutes);
apiRouter.use('/vendor', vendorRoutes);
apiRouter.use('/hour-coffee-test-email', hourCoffeeTestEmailRoutes);
app.use('/api', apiRouter);

app.get('/api/whatsapp/webhook-test', (_req, res) => {
  res.status(200).type('text/plain').send('ok');
});

app.get('/test-route', (req, res) => {
  res.send('TEST OK');
});

if (require.main === module) {
  httpServer.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}
