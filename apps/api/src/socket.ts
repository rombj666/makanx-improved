import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyToken, verifyGuestToken } from './utils/jwt';
import { decode, JwtPayload } from 'jsonwebtoken';
import prisma from './utils/prisma';
import { vendorTokenFromCookieHeader } from './utils/vendor-auth-cookie';

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
  if (allowedOrigins.includes('*')) {
    throw new Error('CORS_ORIGIN and CLIENT_URL must list explicit origins when credentials are enabled');
  }

  console.log('[socket] allowed origins', { origins: allowedOrigins });

  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        const cleaned = normalize(origin);
        if (allowedOrigins.includes(cleaned)) return cb(null, cleaned);
        return cb(null, false);
      },
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  io.use(async (socket, next) => {
    const bearerToken = socket.handshake.auth?.token;
    const cookieToken = vendorTokenFromCookieHeader(socket.handshake.headers.cookie);
    const reject = () => {
      const error = new Error('Authentication required: invalid or expired token') as Error & { data: object };
      error.data = { code: 'SOCKET_AUTH_ERROR' };
      next(error);
    };
    const token = typeof bearerToken === 'string' && bearerToken ? bearerToken : (cookieToken || '');
    if (!token) return reject();
    try {
      let vendorUserId: string | undefined;
      if (typeof bearerToken === 'string' && bearerToken) {
        // Bearer is exclusively a guest credential after the vendor migration.
        socket.data.guestId = verifyGuestToken(token).guestId;
      } else {
        vendorUserId = verifyToken(token).userId;
      }
      if (vendorUserId) {
        const vendor = await prisma.vendorProfile.findUnique({
          where: { userId: vendorUserId }, select: { id: true },
        });
        if (!vendor) return reject();
        socket.data.room = `vendor:${vendor.id}`;
      } else {
        socket.data.room = `user:${socket.data.guestId}`;
      }
      // Read expiry only after signature and identity verification above.
      const verifiedToken = vendorUserId && cookieToken ? cookieToken : token;
      const expiresAt = (decode(verifiedToken) as JwtPayload).exp;
      if (typeof expiresAt !== 'number' || expiresAt * 1000 <= Date.now()) return reject();
      socket.data.expiresAt = expiresAt * 1000;
      next();
    } catch {
      return reject();
    }
  });

  io.on('connection', (socket: Socket) => {
    let expiryTimer: ReturnType<typeof setTimeout>;
    const enforceExpiry = () => {
      const remaining = socket.data.expiresAt - Date.now();
      if (remaining <= 0) {
        socket.emit('auth_error', { code: 'SOCKET_AUTH_ERROR', message: 'Session expired. Please authenticate again.' });
        socket.disconnect(true);
        return;
      }
      // Guest tokens may outlive Node's maximum timeout; reschedule without overflow.
      expiryTimer = setTimeout(enforceExpiry, Math.min(remaining, 2_147_483_647));
      expiryTimer.unref();
    };
    enforceExpiry();
    if (socket.connected) void socket.join(socket.data.room);
    // Room membership is server-owned. No client join/join_vendor handlers exist.
    socket.on('disconnect', () => clearTimeout(expiryTimer));
  });

  return io;
};

export const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
};
