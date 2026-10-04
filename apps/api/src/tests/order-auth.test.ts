import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

const mocks = vi.hoisted(() => ({
  prisma: { order: { findUnique: vi.fn(), findMany: vi.fn() }, vendorProfile: { findUnique: vi.fn() } },
  createOrder: vi.fn(), createOrderForVendorSlug: vi.fn(),
}));
vi.mock('../utils/prisma', () => ({ default: mocks.prisma }));
vi.mock('../socket', () => ({ getIO: vi.fn() }));
vi.mock('../services/order.service', async () => ({
  ...await vi.importActual<any>('../services/order.service'),
  createOrder: mocks.createOrder, createOrderForVendorSlug: mocks.createOrderForVendorSlug,
}));
import orderRoutes from '../routes/order.routes';
import publicRoutes from '../routes/public.routes';
import authRoutes from '../routes/auth.routes';
import { generateGuestToken, generateToken, verifyGuestToken, verifyToken } from '../utils/jwt';
import { VENDOR_AUTH_COOKIE } from '../utils/vendor-auth-cookie';

const app = express();
app.use(express.json());
app.use('/api/orders', orderRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
const guestA = generateGuestToken('guest:A');
const guestB = generateGuestToken('guest:B');
const vendorA = generateToken({ userId: 'staff-A', role: 'VENDOR' });
const vendorB = generateToken({ userId: 'staff-B', role: 'VENDOR' });
const vendorCookie = (token: string) => `${VENDOR_AUTH_COOKIE}=${encodeURIComponent(token)}`;
const order = {
  id: 'order-A', vendorId: 'vendor-A', customerId: 'guest:A', customerName: 'Private Name',
  customerPhone: 'Private Phone', customerEmail: 'private@example.com', deviceId: 'private-device',
  eventOrderNumber: 7, status: 'PREPARING', vendor: { businessName: 'Cafe', slug: 'cafe', secret: 'hidden' },
  items: [{ id: 'internal-item', quantity: 1, price: 5, remark: 'My remark', menuItem: { name: 'Tea', vendorId: 'internal' } }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.prisma.order.findUnique.mockImplementation(async ({ where }) => where.id === order.id ? order : null);
  mocks.prisma.vendorProfile.findUnique.mockImplementation(async ({ where }) => ({ id: where.userId === 'staff-A' ? 'vendor-A' : 'vendor-B' }));
  mocks.prisma.order.findMany.mockImplementation(async ({ where }) => where.customerId === 'guest:A' ? [order] : []);
  mocks.createOrder.mockResolvedValue({ order, estimatedMinutes: 5 });
  mocks.createOrderForVendorSlug.mockResolvedValue({ order, estimatedMinutes: 5 });
});

describe('JWT authentication', () => {
  it('uses the configured secret and retains vendor claims and expiry', () => {
    const payload = jwt.verify(vendorA, process.env.JWT_SECRET!) as jwt.JwtPayload;
    expect(payload.userId).toBe('staff-A');
    expect(payload.exp! - payload.iat!).toBe(7 * 24 * 60 * 60);
    expect(verifyToken(vendorA).role).toBe('VENDOR');
    expect(() => verifyToken(jwt.sign({ userId: 'staff-A', role: 'VENDOR' }, 'wrong-test-key'))).toThrow();
  });
  it('strictly separates guest and vendor claims', () => {
    expect(() => verifyToken(guestA)).toThrow();
    expect(() => verifyGuestToken(vendorA)).toThrow();
  });
});

describe('order ownership', () => {
  it.each([[vendorA, true], [guestA, false]] as const)('allows an owner', async (token, vendor) => {
    const call = request(app).get('/api/orders/order-A');
    const response = vendor ? await call.set('Cookie', vendorCookie(token)) : await call.auth(token, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data.eventOrderNumber).toBe(7);
  });
  it.each([[vendorB, true], [guestB, false]] as const)('rejects a different owner without details', async (token, vendor) => {
    const call = request(app).get('/api/orders/order-A');
    const response = vendor ? await call.set('Cookie', vendorCookie(token)) : await call.auth(token, { type: 'bearer' });
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ success: false, error: 'Order unavailable' });
  });
  it('authenticates before looking up orders', async () => {
    expect((await request(app).get('/api/orders/order-A?guestId=guest:A')).status).toBe(401);
    expect(mocks.prisma.order.findUnique).not.toHaveBeenCalled();
  });
  it('returns 404 with the same generic error for missing orders', async () => {
    const response = await request(app).get('/api/orders/missing').auth(guestA, { type: 'bearer' });
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, error: 'Order unavailable' });
  });
  it('omits PII and internal data for customers while retaining vendor details', async () => {
    const customer = await request(app).get('/api/orders/order-A').auth(guestA, { type: 'bearer' });
    for (const key of ['customerId', 'customerName', 'customerPhone', 'customerEmail', 'deviceId', 'vendorId']) {
      expect(customer.body.data).not.toHaveProperty(key);
    }
    expect(customer.body.data.items[0]).not.toHaveProperty('id');
    expect(customer.body.data.vendor).not.toHaveProperty('secret');
    const vendor = await request(app).get('/api/orders/order-A').set('Cookie', vendorCookie(vendorA));
    expect(vendor.body.data.customerName).toBe(order.customerName);
  });
});

describe('guest authentication and transition', () => {
  it('ignores supplied legacy identities when issuing credentials', async () => {
    const response = await request(app).post('/api/auth/guest').send({ guestId: 'guest:A' });
    expect(response.status).toBe(200);
    const identity = verifyGuestToken(response.body.data.guestAccessToken);
    expect(identity.guestId).toBe(response.body.data.guestId);
    expect(identity.guestId).not.toBe('guest:A');
    expect(mocks.prisma.order.findUnique).not.toHaveBeenCalled();
  });
  it('renews a verified identity and refuses vendor credentials', async () => {
    const response = await request(app).post('/api/auth/guest').auth(guestA, { type: 'bearer' }).send({ guestId: 'guest:B' });
    expect(verifyGuestToken(response.body.data.guestAccessToken).guestId).toBe('guest:A');
    expect((await request(app).post('/api/auth/guest').auth(vendorA, { type: 'bearer' })).status).toBe(401);
  });
  it('queries history only by verified identity, ignoring query guestId', async () => {
    const response = await request(app).get('/api/orders/my-orders?guestId=guest:B').auth(guestA, { type: 'bearer' });
    expect(response.status).toBe(200);
    expect(response.body.data.map((entry: any) => entry.id)).toEqual(['order-A']);
    expect(mocks.prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { customerId: 'guest:A' } }));
    expect((await request(app).get('/api/orders/my-orders?guestId=guest:A')).status).toBe(401);
    expect((await request(app).get('/api/orders/my-orders').auth(vendorA, { type: 'bearer' })).status).toBe(401);
  });
  it.each([
    'invalid', guestA.slice(0, -5) + 'abcde',
    jwt.sign({ tokenType: 'guest', guestId: 'guest:A' }, process.env.JWT_SECRET!, { audience: 'guest-orders', expiresIn: -1 }),
    jwt.sign({ tokenType: 'guest', guestId: 'guest:A' }, 'wrong-test-key', { audience: 'guest-orders' }),
    jwt.sign({ tokenType: 'guest', guestId: 123 }, process.env.JWT_SECRET!, { audience: 'guest-orders' }),
  ])('rejects malformed, tampered, expired and forged credentials', async (token) => {
    expect((await request(app).get('/api/orders/my-orders').auth(token, { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/api/orders/order-A').auth(token, { type: 'bearer' })).status).toBe(401);
  });
  it('does not permit guest credentials on vendor APIs', async () => {
    expect((await request(app).get('/api/orders/vendor-orders').auth(guestA, { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/api/auth/me').auth(guestA, { type: 'bearer' })).status).toBe(401);
  });
  it.each(['/api/orders', '/api/public/vendors/cafe/orders'])('binds creation to the token on %s', async (path) => {
    expect((await request(app).post(path).send({ guestId: 'guest:A' })).status).toBe(401);
    const response = await request(app).post(path).auth(guestA, { type: 'bearer' }).send({ guestId: 'guest:B' });
    expect(response.status).toBe(201);
    const mock = path === '/api/orders' ? mocks.createOrder : mocks.createOrderForVendorSlug;
    expect(mock.mock.calls[0][1].guestId).toBe('guest:A');
    expect(response.body.data.order).not.toHaveProperty('customerId');
    expect((await request(app).get(`/api/orders/${response.body.data.order.id}`).auth(guestA, { type: 'bearer' })).status).toBe(200);
  });
});
