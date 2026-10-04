import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { api } from './api';
import { guestApi } from './guest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { Login } from '../pages/auth/Login';
import { resetVendorSession, SESSION_EXPIRED_MESSAGE, VENDOR_SESSION_EXPIRED } from './vendorSession';

let storage: Map<string, string>;
let replace: ReturnType<typeof vi.fn>;
let auth: ReturnType<typeof useAuth>;
let tree: ReactTestRenderer | undefined;
let status: number;
let expiredEvents: number;
const user = { id: 'staff', email: 'staff@example.test', name: 'Staff', role: 'VENDOR' };
function Probe() { auth = useAuth(); return null; }
function reject(config: any, code: number): never {
  throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, undefined,
    { status: code, statusText: 'Failed', headers: {}, config, data: {} });
}
beforeEach(() => {
  resetVendorSession();
  status = 200;
  expiredEvents = 0;
  storage = new Map([
    ['customer-cart', 'keep-cart'],
    ['smart_qr_guest_credential', JSON.stringify({ guestAccessToken: 'guest-token', renewedAt: Date.now() })],
  ]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  replace = vi.fn();
  const browser = Object.assign(new EventTarget(), { location: { pathname: '/vendor/live-orders', replace } });
  browser.addEventListener(VENDOR_SESSION_EXPIRED, () => expiredEvents++);
  vi.stubGlobal('window', browser);
  api.defaults.adapter = async (config) => {
    if (status !== 200) reject(config, status);
    return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true, data: user } };
  };
});
afterEach(() => { if (tree) act(() => tree!.unmount()); tree = undefined; vi.unstubAllGlobals(); });
async function mount(login = false) {
  await act(async () => {
    tree = create(<AuthProvider><MemoryRouter><Probe />{login && <Login />}</MemoryRouter></AuthProvider>);
  });
}

describe('central vendor 401 handling', () => {
  it('clears AuthContext, redirects once, and preserves customer data', async () => {
    await mount();
    expect(auth.isAuthenticated).toBe(true);
    status = 401;
    await act(async () => { await Promise.allSettled(Array.from({ length: 5 }, () => api.get('/orders/vendor-live'))); });
    expect(auth.user).toBeNull();
    expect(auth.isAuthenticated).toBe(false);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/login?reason=session-expired');
    expect(expiredEvents).toBe(1);
    expect(storage.get('customer-cart')).toBe('keep-cart');
    expect(storage.has('smart_qr_guest_credential')).toBe(true);
  });
  it('keeps vendor state on 403', async () => {
    await mount(); status = 403;
    await act(async () => { await expect(api.get('/vendor/settings')).rejects.toBeDefined(); });
    expect(auth.isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not attach vendor tokens or redirect on public/customer authentication failures', async () => {
    await mount();
    api.defaults.adapter = async (config) => {
      expect(config.headers.Authorization).toBeUndefined(); reject(config, 401);
    };
    guestApi.defaults.adapter = async (config) => {
      expect(config.headers.Authorization).toBe('Bearer guest-token'); reject(config, 401);
    };
    await act(async () => {
      await expect(api.get('/public/vendors/cafe/menu')).rejects.toBeDefined();
      await expect(guestApi.get('/orders/my-orders')).rejects.toBeDefined();
    });
    expect(auth.isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
  it('does not redirect a customer page when a background vendor check expires', async () => {
    window.location.pathname = '/v/cafe';
    status = 401;
    await mount();
    expect(auth.user).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
  it('shows expiration on the login page without a redirect loop', async () => {
    window.location.pathname = '/login';
    await mount(true); status = 401;
    await act(async () => { await expect(api.get('/auth/me')).rejects.toBeDefined(); });
    expect(replace).not.toHaveBeenCalled();
    expect(JSON.stringify(tree!.toJSON())).toContain(SESSION_EXPIRED_MESSAGE);
    await expect(api.post('/auth/login', {})).rejects.toBeDefined();
    expect(expiredEvents).toBe(1);
  });
  it('does not log out a newer login when an old request fails late', async () => {
    await mount();
    api.defaults.adapter = async (config) => {
      await act(async () => { auth.login(user as any); });
      reject(config, 401);
    };
    await expect(api.get('/vendor/settings')).rejects.toBeDefined();
    expect(auth.isAuthenticated).toBe(true);
    expect(replace).not.toHaveBeenCalled();
  });
});
