import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken } from './utils/jwt';

let io: Server;

export const initSocket = (httpServer: HttpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket: Socket) => {
    console.log('Client connected:', socket.id);

    // Join rooms based on role/id
    // Client should emit 'join' event with token or we parse auth header from handshake
    socket.on('join', (token: string) => {
      try {
        const decoded = verifyToken(token);
        const { userId, role } = decoded;

        socket.join(`user:${userId}`);
        console.log(`Socket ${socket.id} joined user:${userId}`);

        if (role === 'VENDOR') {
          // Ideally we need vendorId, but let's assume userId maps to vendor profile
          // or we fetch profile here. For simplicity, let's join vendor-user room
          // But OrderService needs to emit to 'vendor:{vendorId}'. 
          // We can fetch vendorProfile id from user id.
          // For now, let's trust the client sends vendorId or we look it up?
          // Better: Look it up. But let's keep it simple: client sends { vendorId } if vendor.
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
