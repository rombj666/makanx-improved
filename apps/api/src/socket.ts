import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  const normalize = (s: string) => s.trim().replace(/\/$/, "");

  const allowedOrigins = [
    "https://makanx-improved-web.vercel.app",
    "http://localhost:5173"
  ].map(normalize);

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const cleaned = normalize(origin);
        if (allowedOrigins.includes(cleaned)) return cb(null, cleaned);
        return cb(new Error("socket.io CORS blocked: " + origin));
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

   socket.on('join', async (token: string) => {
  try {
    const decoded = verifyToken(token);
    const { userId, role } = decoded;

    socket.join(`user:${userId}`);
    console.log(`Socket ${socket.id} joined user:${userId}`);

    if (role === 'VENDOR') {
      const vendorProfile = await prisma.vendorProfile.findUnique({
        where: { userId }
      });

      if (vendorProfile) {
        socket.join(`vendor:${vendorProfile.id}`);
        console.log(
          `Socket ${socket.id} joined vendor:${vendorProfile.id}`
        );
      } else {
        console.warn(`Vendor profile not found for user ${userId}`);
      }
    }
  } catch (e) {
    console.error('Socket join failed:', e);
  }
});

    socket.on('join_vendor', (vendorId: string) => {
       // verify token again or assume trusted if we had proper middleware
       // For prototype, just join
       socket.join(`vendor:${vendorId}`);
       console.log(`Socket ${socket.id} joined vendor:${vendorId}`);
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
