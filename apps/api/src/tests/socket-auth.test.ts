import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { io as clientIO, Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
const mocks = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../utils/prisma', () => ({ default: { vendorProfile: { findUnique: mocks.findUnique } } }));
import { initSocket } from '../socket';
import { generateGuestToken, generateToken } from '../utils/jwt';
import { VENDOR_AUTH_COOKIE } from '../utils/vendor-auth-cookie';

let http: HttpServer;
let io: Server;
let url: string;
let clients: Socket[];
beforeEach(async () => {
  clients = [];
  mocks.findUnique.mockImplementation(async ({ where }) => where.userId === 'missing' ? null : { id: where.userId });
  http = createServer();
  io = initSocket(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(http.address() as any).port}`;
});
afterEach(async () => {
  clients.forEach((client) => client.disconnect());
  await new Promise<void>((resolve) => io.close(() => resolve()));
});
function connect(auth: object): Promise<Socket> {
  const client = clientIO(url, { auth, transports: ['websocket'], reconnection: false, autoConnect: false });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
    client.connect();
  });
}
function connectWithVendorCookie(token: string): Promise<Socket> {
  const client = clientIO(url, {
    auth: {}, transports: ['websocket'], reconnection: false, autoConnect: false,
    extraHeaders: { Cookie: `${VENDOR_AUTH_COOKIE}=${encodeURIComponent(token)}` },
  });
  clients.push(client);
  return new Promise((resolve, reject) => {
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
    client.connect();
  });
}
function once(socket: Socket, event: string): Promise<any> {
  return new Promise((resolve) => socket.once(event, resolve));
}
async function flush(client: Socket) {
  const server = io.sockets.sockets.get(client.id!)!;
  await new Promise<void>((resolve) => {
    server.once('test_flush', (ack) => { ack(); resolve(); });
    client.emit('test_flush', () => undefined);
  });
}

describe('authenticated socket subscriptions', () => {
  it('uses only the verified guest identity and ignores all client room claims', async () => {
    const client = await connect({ token: generateGuestToken('guest:A'), guestId: 'guest:B', userId: 'B', room: 'user:guest:B' });
    client.emit('join', 'user:guest:B');
    client.emit('join', generateToken({ userId: 'B', role: 'VENDOR' }));
    client.emit('join_vendor', 'B');
    await flush(client);
    expect([...io.sockets.sockets.get(client.id!)!.rooms].sort()).toEqual([client.id!, 'user:guest:A'].sort());
    const received = once(client, 'order_updated');
    io.to('user:guest:A').emit('order_updated', { id: 'own-order' });
    expect(await received).toEqual({ id: 'own-order' });
  });
  it.each([
    {}, { guestId: 'guest:A' }, { token: 'invalid' },
    { token: jwt.sign({ tokenType: 'guest', guestId: 'guest:A' }, process.env.JWT_SECRET!, { audience: 'guest-orders', expiresIn: -1 }) },
    { token: jwt.sign({ userId: 'A', role: 'VENDOR' }, process.env.JWT_SECRET!, { expiresIn: -1 }) },
    { token: jwt.sign({ userId: 'A', role: 'VENDOR' }, 'forged-secret', { expiresIn: '1h' }) },
    { token: generateToken({ userId: 'missing', role: 'VENDOR' }) },
  ])('rejects missing, invalid, expired and unauthorized credentials', async (auth) => {
    await expect(connect(auth)).rejects.toMatchObject({ data: { code: 'SOCKET_AUTH_ERROR' } });
    expect(io.sockets.sockets.size).toBe(0);
  });
  it('isolates vendors and guests in both directions', async () => {
    const vendorA = await connectWithVendorCookie(generateToken({ userId: 'A', role: 'VENDOR' }));
    const vendorB = await connectWithVendorCookie(generateToken({ userId: 'B', role: 'VENDOR' }));
    const guestA = await connect({ token: generateGuestToken('guest:A') });
    const guestB = await connect({ token: generateGuestToken('guest:B') });
    const received: Record<string, any[]> = { vendorA: [], vendorB: [], guestA: [], guestB: [] };
    for (const [key, socket] of Object.entries({ vendorA, vendorB, guestA, guestB })) {
      socket.on('order_updated', (payload) => received[key].push(payload));
      socket.emit('join_vendor', key === 'vendorA' ? 'B' : 'A');
      socket.emit('join', 'user:guest:B');
      await flush(socket);
    }
    io.to('vendor:A').emit('order_updated', 'vendor-A-order');
    io.to('vendor:B').emit('order_updated', 'vendor-B-order');
    io.to('user:guest:A').emit('order_updated', 'guest-A-order');
    io.to('user:guest:B').emit('order_updated', 'guest-B-order');
    // Markers on the same transport ensure earlier packets have arrived everywhere.
    const markers = clients.map((socket) => once(socket, 'test_marker'));
    io.emit('test_marker');
    await Promise.all(markers);
    expect(received).toEqual({ vendorA: ['vendor-A-order'], vendorB: ['vendor-B-order'], guestA: ['guest-A-order'], guestB: ['guest-B-order'] });
  });
  it.each(['vendor', 'guest'])('disconnects an already-connected %s at expiry and rejects reconnection', async (type) => {
    const payload = type === 'vendor' ? { userId: 'A', role: 'VENDOR' } : { tokenType: 'guest', guestId: 'guest:A' };
    const token = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: 2, ...(type === 'guest' ? { audience: 'guest-orders' } : {}) });
    const client = type === 'vendor' ? await connectWithVendorCookie(token) : await connect({ token });
    const error = once(client, 'auth_error');
    const disconnected = once(client, 'disconnect');
    expect(await error).toMatchObject({ code: 'SOCKET_AUTH_ERROR' });
    await disconnected;
    expect(io.sockets.sockets.size).toBe(0);
    const reconnect = type === 'vendor' ? connectWithVendorCookie(token) : connect({ token });
    await expect(reconnect).rejects.toMatchObject({ data: { code: 'SOCKET_AUTH_ERROR' } });
  });
});
