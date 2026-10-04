import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { initSocket } from './socket';
import authRoutes from './routes/auth.routes';
import orderRoutes from './routes/order.routes';
import uploadRoutes from './routes/upload.routes';
import menuRoutes from './routes/menu.routes';
import analyticsRoutes from './routes/analytics.routes';
import vendorRoutes from './routes/vendor.routes';
import publicRoutes from './routes/public.routes';

import { configureSecurity } from './middleware/security';
import { deviceMiddleware } from './middleware/device';


export const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3001;

// Init Socket.IO
initSocket(httpServer);

// Security Middleware
app.set('trust proxy', 1); // Cloudflare router replaces X-Forwarded-For with the edge client IP.

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
if (allowedOrigins.includes('*')) {
  throw new Error('CORS_ORIGIN and CLIENT_URL must list explicit origins when credentials are enabled');
}

console.log('[cors] allowed origins', { origins: allowedOrigins });

const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const cleaned = normalizeOrigin(origin);
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

// Routes
const apiRouter = express.Router();
apiRouter.use(deviceMiddleware);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/public', publicRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/uploads', uploadRoutes);
apiRouter.use('/menu-items', menuRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/vendor', vendorRoutes);
app.use('/api', apiRouter);

app.get('/', (_req, res) => {
  res.send('Smart QR Ordering System API Running');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'smart-qr-api' });
});

app.get('/test-route', (req, res) => {
  res.send('TEST OK');
});

if (require.main === module) {
  httpServer.listen(Number(port), '0.0.0.0', () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}
