import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../index';
import { requireAdmin } from '../middleware/auth';

describe('Simplified API surface', () => {
  it('reports the active product name', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('Smart QR Ordering System API Running');
  });

  it('does not expose organizer, event, or booth routes', async () => {
    const responses = await Promise.all([
      request(app).get('/api/organizer'),
      request(app).get('/api/events'),
      request(app).get('/api/booths'),
    ]);
    responses.forEach((response) => expect(response.status).toBe(404));
  });
});

describe('vendor account permissions', () => {
  it('blocks Barista from Admin-only backend routes', () => {
    const req: any = { user: { userId: 'barista', role: 'VENDOR' }, vendorAccess: { permission: 'BARISTA', vendorId: 'vendor', ownerUserId: 'admin' } };
    const res: any = { status: (code: number) => ({ json: (body: unknown) => ({ code, body }) }) };
    let nextCalled = false;
    const result = requireAdmin(req, res, () => { nextCalled = true; });
    expect((result as any).code).toBe(403);
    expect(nextCalled).toBe(false);
  });

  it('allows Admin through Admin-only backend routes', () => {
    const req: any = { user: { userId: 'admin', role: 'VENDOR' }, vendorAccess: { permission: 'ADMIN', vendorId: 'vendor', ownerUserId: 'admin' } };
    let nextCalled = false;
    requireAdmin(req, {} as any, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
});
