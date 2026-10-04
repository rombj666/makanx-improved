import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
const mocks = vi.hoisted(() => ({
  auth: { user: { id: 'staff' } as { id: string } | null, isLoading: false },
  guest: vi.fn(), expire: vi.fn(), io: vi.fn(), clients: [] as any[],
}));
vi.mock('./AuthContext', () => ({ useAuth: () => mocks.auth }));
vi.mock('../lib/guest', () => ({ ensureGuestToken: mocks.guest }));
vi.mock('../lib/vendorSession', () => ({ expireVendorSession: mocks.expire, getVendorSessionVersion: () => 3 }));
vi.mock('../lib/api', () => ({ API_ORIGIN: 'https://example.test' }));
vi.mock('socket.io-client', () => ({ io: mocks.io }));
import { SocketProvider, useSocket } from './SocketContext';
let tree: ReactTestRenderer;
let state: ReturnType<typeof useSocket>;
function Probe() { state = useSocket(); return null; }
beforeEach(() => {
  mocks.clients.length = 0;
  mocks.auth.user = { id: 'staff' };
  mocks.guest.mockReset().mockResolvedValue('guest-token');
  mocks.expire.mockReset();
  mocks.io.mockReset().mockImplementation((_url, options) => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const client: any = {
      options, handlers, credentials: null, emit: vi.fn(),
      on: (event: string, callback: (...args: any[]) => void) => { handlers[event] = callback; },
      connect: vi.fn(() => options.auth((auth: any) => { client.credentials = auth; handlers.connect(); })),
      disconnect: vi.fn(() => handlers.disconnect?.()),
    };
    mocks.clients.push(client);
    return client;
  });
});
afterEach(() => { act(() => tree.unmount()); vi.unstubAllGlobals(); });
async function mount(path: string) {
  await act(async () => { tree = create(<MemoryRouter initialEntries={[path]}><SocketProvider><Probe /></SocketProvider></MemoryRouter>); });
}
describe('socket client authentication lifecycle', () => {
  it('uses guest credentials on customer pages even when vendor is signed in', async () => {
    await mount('/v/cafe');
    const client = mocks.clients[0];
    expect(client.credentials).toEqual({ token: 'guest-token' });
    expect(client.emit).not.toHaveBeenCalled();
    expect(state.isConnected).toBe(true);
    act(() => client.handlers.auth_error({ code: 'SOCKET_AUTH_ERROR' }));
    expect(state.isConnected).toBe(false);
    expect(mocks.expire).not.toHaveBeenCalled();
  });
  it('reads the current vendor token on reconnect and shares session-expiry handling', async () => {
    await mount('/vendor');
    const client = mocks.clients[0];
    expect(client.credentials).toEqual({});
    const callback = vi.fn();
    client.options.auth(callback);
    expect(callback).toHaveBeenCalledWith({});
    act(() => client.handlers.connect_error({ data: { code: 'SOCKET_AUTH_ERROR' } }));
    expect(mocks.expire).toHaveBeenCalledWith(3);
    expect(client.disconnect).toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalled();
  });
  it('does not log out for transport errors', async () => {
    await mount('/vendor');
    act(() => mocks.clients[0].handlers.connect_error(new Error('Network unavailable')));
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(state.isConnected).toBe(false);
  });
  it('does not connect on the login page', async () => {
    await mount('/login');
    expect(mocks.io).not.toHaveBeenCalled();
  });
});
