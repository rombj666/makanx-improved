import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comparePassword, hashPassword } from '../utils/password';

const mocks = vi.hoisted(() => ({ findUser: vi.fn(), findVendor: vi.fn() }));
vi.mock('../utils/prisma', () => ({ default: { user: { findUnique: mocks.findUser }, vendorProfile: { findUnique: mocks.findVendor } } }));
import { login } from '../services/auth.service';

const vendor = { id: 'hour-coffee-vendor-id', slug: 'hour-coffee', businessName: 'Hour Coffee' };
let adminHash: string;
let baristaHash: string;

beforeEach(async () => {
  adminHash = await hashPassword('admin-secret');
  baristaHash = await hashPassword('Hour Coffee');
  mocks.findUser.mockImplementation(async ({ where }) => {
    if (where.email === 'rombj45@gmail.com') return {
      id: 'existing-admin-id', email: 'rombj45@gmail.com', name: 'Admin', password: adminHash,
      role: 'VENDOR', permission: 'ADMIN', vendorId: null, isActive: true, vendorProfile: vendor,
    };
    if (where.email === 'hour coffee') return {
      id: 'barista-id', email: 'hour coffee', name: 'Hour Coffee', password: baristaHash,
      role: 'VENDOR', permission: 'BARISTA', vendorId: vendor.id, isActive: true, vendorProfile: null,
    };
    return null;
  });
  mocks.findVendor.mockResolvedValue(vendor);
});

describe('username account login', () => {
  it('keeps the existing email-shaped Admin identity and its Vendor', async () => {
    const result = await login({ username: '  ROMBJ45@GMAIL.COM ', password: 'admin-secret' });
    expect(result.user.id).toBe('existing-admin-id');
    expect(result.user.permission).toBe('ADMIN');
    expect(result.user.vendorProfile?.id).toBe(vendor.id);
  });

  it('logs in a space-containing username linked to that same Vendor', async () => {
    const result = await login({ username: ' Hour Coffee ', password: 'Hour Coffee' });
    expect(result.user.permission).toBe('BARISTA');
    expect(result.user.vendorProfile?.id).toBe(vendor.id);
    expect(await comparePassword('Hour Coffee', baristaHash)).toBe(true);
    expect(baristaHash).not.toBe('Hour Coffee');
  });

  it('rejects an incorrect case-sensitive password', async () => {
    await expect(login({ username: 'Hour Coffee', password: 'hour coffee' })).rejects.toThrow('Invalid username or password');
  });
});
