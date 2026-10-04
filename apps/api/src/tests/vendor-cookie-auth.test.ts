import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { generateGuestToken, generateToken } from '../utils/jwt';
import { VENDOR_AUTH_COOKIE } from '../utils/vendor-auth-cookie';

const mocks = vi.hoisted(() => ({ login: vi.fn(), getMe: vi.fn() }));
vi.mock('../services/auth.service', () => ({
  login: mocks.login,
  getMe: mocks.getMe,
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
}));
import authRoutes from '../routes/auth.routes';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

const user = { id: 'vendor-user', email: 'vendor@example.test', name: 'Vendor', role: 'VENDOR' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ user, token: generateToken({ userId: user.id, role: 'VENDOR' }) });
  mocks.getMe.mockResolvedValue(user);
});
afterEach(() => vi.unstubAllEnvs());

describe('vendor HttpOnly cookie authentication', () => {
  it.each([
    ['development', false],
    ['production', true],
  ])('sets an HttpOnly SameSite cookie after %s login', async (environment, secure) => {
    vi.stubEnv('NODE_ENV', environment);
    const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'password' });
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ user });
    expect(response.body.data).not.toHaveProperty('token');
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain(`${VENDOR_AUTH_COOKIE}=`);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie.includes('Secure')).toBe(secure);
  });

  it('authenticates a vendor API through the cookie and rejects missing or guest credentials', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: user.email, password: 'password' }).expect(200);
    expect((await agent.get('/api/auth/me')).status).toBe(200);
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').auth(generateToken({ userId: user.id, role: 'VENDOR' }), { type: 'bearer' })).status).toBe(401);
    expect((await request(app).get('/api/auth/me').auth(generateGuestToken('guest:A'), { type: 'bearer' })).status).toBe(401);
  });

  it('clears the cookie on logout', async () => {
    const response = await request(app).post('/api/auth/logout');
    const cookie = response.headers['set-cookie'][0];
    expect(response.status).toBe(200);
    expect(cookie).toContain(`${VENDOR_AUTH_COOKIE}=`);
    expect(cookie).toContain('Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    expect(cookie).toContain('HttpOnly');
  });

  it('uses one response for unknown users and wrong passwords without sensitive logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    for (const error of [new Error('User not found'), new Error('Password incorrect')]) {
      mocks.login.mockRejectedValueOnce(error);
      const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'secret-input' });
      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Invalid email or password' });
    }
    const output = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    expect(output).not.toContain('secret-input');
    expect(output).not.toContain('User not found');
    expect(output).not.toContain('Password incorrect');
    log.mockRestore(); warn.mockRestore();
  });
});
