import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  const stripQuotes = (s: string) => s.replace(/^['"`]+|['"`]+$/g, '');
  const normalize = (s: string) => stripQuotes(s.trim()).replace(/\/+$/, "");
  const parseOriginList = (raw: unknown) => {
    const input = typeof raw === 'string' ? raw : '';
    return input
      .split(/[,\s]+/g)
      .map((x) => normalize(x))
      .filter(Boolean);
  };

  const originsFromEnv = [
    ...parseOriginList(process.env.CORS_ORIGIN),
    ...parseOriginList(process.env.CLIENT_URL),
  ].filter(Boolean);

  const isProd = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const defaultDevOrigins = isProd ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  const allowedOrigins = Array.from(new Set([...originsFromEnv, ...defaultDevOrigins].map(normalize)));
  const allowAllOrigins = allowedOrigins.includes('*');

  console.log('[socket] allowed origins', { allowAll: allowAllOrigins, origins: allowedOrigins.filter((o) => o !== '*') });

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const cleaned = normalize(origin);
        if (allowAllOrigins) return cb(null, true);
        if (allowedOrigins.includes(cleaned)) return cb(null, cleaned);
        return cb(null, false);
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use((socket, next) => {
    const token = (socket.handshake as any)?.auth?.token;
    const guestId = (socket.handshake as any)?.auth?.guestId;
    if (typeof guestId === 'string' && guestId.trim() !== '') {
      (socket.data as any).guestId = guestId.trim();
    }
    if (typeof token === 'string' && token.trim() !== '') {
      try {
        const decoded: any = verifyToken(token.trim());
        (socket.data as any).userId = decoded?.userId;
        (socket.data as any).role = decoded?.role;
      } catch {}
    }
    next();
  });

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    const autoGuestId = String((socket.data as any)?.guestId || '').trim();
    if (autoGuestId) {
      socket.join(`user:${autoGuestId}`);
      console.log(`Socket ${socket.id} joined guest room user:${autoGuestId}`);
    }

    const autoUserId = String((socket.data as any)?.userId || '').trim();
    const autoRole = String((socket.data as any)?.role || '').trim();
    if (autoUserId) {
      socket.join(`user:${autoUserId}`);
      console.log(`Socket ${socket.id} joined user:${autoUserId}`);
    }
    if (autoUserId && autoRole === 'VENDOR') {
      prisma.vendorProfile
        .findUnique({ where: { userId: autoUserId } })
        .then((vendorProfile) => {
          if (vendorProfile) {
            (socket.data as any).vendorId = vendorProfile.id;
            socket.join(`vendor:${vendorProfile.id}`);
            console.log(`Socket ${socket.id} joined vendor:${vendorProfile.id}`);
          } else {
            console.warn(`Vendor profile not found for user ${autoUserId}`);
          }
        })
        .catch((e) => {
          console.error('Socket vendor auto-join failed:', e);
        });
    }

    socket.on('join', async (payload: string) => {
      if (payload && payload.startsWith('user:')) {
        const guestId = payload.split(':')[1];
        if (guestId) {
          socket.join(`user:${guestId}`);
          console.log(`Socket ${socket.id} joined guest room user:${guestId}`);
          (socket.data as any).guestId = guestId;
        }
        return;
      }

      try {
        const decoded: any = verifyToken(payload);
        const { userId, role } = decoded;

        (socket.data as any).userId = userId;
        (socket.data as any).role = role;
        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined user:${userId}`);

        if (role === 'VENDOR') {
          const vendorProfile = await prisma.vendorProfile.findUnique({
            where: { userId }
          });

          if (vendorProfile) {
            (socket.data as any).vendorId = vendorProfile.id;
            socket.join(`vendor:${vendorProfile.id}`);
            console.log(`Socket ${socket.id} joined vendor:${vendorProfile.id}`);
          } else {
            console.warn(`Vendor profile not found for user ${userId}`);
          }
        }
      } catch (e) {
        console.error('Socket join failed:', e);
      }
    });

    socket.on('join_vendor', async (vendorId: string) => {
      const claimed = String(vendorId || '').trim();
      const bound = String((socket.data as any)?.vendorId || '').trim();
      if (bound && claimed && bound !== claimed) {
        console.warn(`Socket ${socket.id} denied join_vendor vendor:${claimed}`);
        return;
      }
      if (!bound && claimed) {
        const role = String((socket.data as any)?.role || '').trim();
        const userId = String((socket.data as any)?.userId || '').trim();
        if (role !== 'VENDOR' || !userId) {
          console.warn(`Socket ${socket.id} denied join_vendor vendor:${claimed}`);
          return;
        }
        try {
          const vendorProfile = await prisma.vendorProfile.findUnique({ where: { userId } });
          const actual = String(vendorProfile?.id || '').trim();
          if (!actual || actual !== claimed) {
            console.warn(`Socket ${socket.id} denied join_vendor vendor:${claimed}`);
            return;
          }
          (socket.data as any).vendorId = actual;
          socket.join(`vendor:${actual}`);
          console.log(`Socket ${socket.id} joined vendor:${actual}`);
        } catch (e) {
          console.error('Socket join_vendor lookup failed:', e);
        }
        return;
      }
      if (bound) {
        socket.join(`vendor:${bound}`);
        console.log(`Socket ${socket.id} joined vendor:${bound}`);
      }
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};
