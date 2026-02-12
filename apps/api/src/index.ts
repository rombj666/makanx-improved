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

import { configureSecurity } from './middleware/security';

dotenv.config();

export const app = express();
const httpServer = createServer(app);
const port = process.env.PORT || 3001;

// Init Socket.IO
initSocket(httpServer);

// Security Middleware
app.set('trust proxy', 1); // Trust first proxy (Render/Vercel)
configureSecurity(app);

const normalize = (s: string) => s.trim().replace(/\/$/, "");

const allowedOrigins = new Set(
  [
    "https://makanx-improved-web.vercel.app",
    "http://localhost:5173"
  ].map(normalize)
);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const cleaned = normalize(origin);

      if (allowedOrigins.has(cleaned)) {
        return callback(null, cleaned);
      }

      return callback(new Error("CORS blocked: " + origin));
    },
    credentials: true,
    methods: ["GET","POST","PUT","DELETE","PATCH","OPTIONS"],
    allowedHeaders: ["Content-Type","Authorization"],
  })
);

app.options("*", cors());

app.use(express.json());

import path from 'path';

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('MakanX API Running');
});

if (require.main === module) {
  httpServer.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}
