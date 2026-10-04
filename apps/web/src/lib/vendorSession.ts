export const VENDOR_SESSION_EXPIRED = 'smart-qr:vendor-session-expired';
export const SESSION_EXPIRED_MESSAGE = 'Your session has expired. Please log in again.';
let expired = false;
let sessionVersion = 0;

export function resetVendorSession() { expired = false; sessionVersion += 1; }
export function getVendorSessionVersion() { return sessionVersion; }

export function expireVendorSession(requestVersion: number) {
  // A delayed failure from an old session must not log out a newer cookie session.
  if (expired || requestVersion !== sessionVersion) return;
  expired = true;
  // AuthContext and SocketProvider clear their in-memory session state.
  // Guest credentials and customer caches remain intact.
  window.dispatchEvent(new Event(VENDOR_SESSION_EXPIRED));
  const pathname = window.location.pathname;
  if (/^\/(vendor|admin)(\/|$)/.test(pathname)) {
    window.location.replace('/login?reason=session-expired');
  }
}

export function isVendorApi(url: string): boolean {
  const path = url.split('?')[0];
  return path === '/auth/me' ||
    /^\/(vendor|analytics|uploads)(\/|$)/.test(path) ||
    (path.startsWith('/menu-items') && !path.startsWith('/menu-items/public/')) ||
    (path.startsWith('/orders/') && path !== '/orders/my-orders' && !path.startsWith('/orders/vendor/')) ||
    /^\/orders\/vendor\/(production-batch|production\/mark-ready)$/.test(path);
}
