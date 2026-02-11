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

app.use(cors());
app.use(express.json());

// Routes
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/events', eventRoutes);
apiRouter.use('/booths', boothRoutes);
apiRouter.use('/applications', applicationRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/organizer', organizerRoutes);

app.use('/api', apiRouter);

app.get('/', (req, res) => {
  res.send('MakanX API Running');
});

if (require.main === module) {
  httpServer.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
  });
}
