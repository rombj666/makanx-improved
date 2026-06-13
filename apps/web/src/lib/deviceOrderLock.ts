export const ONE_DRINK_ORDER_MESSAGE = 'Only 1 drink can be ordered per device.';
export const DEVICE_ORDER_LOCK_MESSAGE = 'This device has already placed an order for this event.';

const DEVICE_ID_KEY = 'smart_qr_device_id';

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateDeviceId() {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && existing.trim() !== '') return existing;
    const next = makeId();
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return makeId();
  }
}

export function getOrderLockKey(eventKey: string) {
  return `smart_qr_order_lock_${eventKey}`;
}

export function hasOrderLock(eventKey: string) {
  if (!eventKey) return false;
  try {
    return !!localStorage.getItem(getOrderLockKey(eventKey));
  } catch {
    return false;
  }
}

export function saveOrderLock(eventKey: string, orderId: string) {
  if (!eventKey || !orderId) return;
  try {
    localStorage.setItem(
      getOrderLockKey(eventKey),
      JSON.stringify({ orderId, createdAt: new Date().toISOString() })
    );
  } catch {}
}

export function getMaxDrinksOrderMessage(maxDrinksPerOrder: number) {
  const max = Math.max(1, Math.floor(Number(maxDrinksPerOrder) || 1));
  return max === 1 ? ONE_DRINK_ORDER_MESSAGE : `Maximum ${max} drink(s) per order.`;
}
