export const ONE_DRINK_ORDER_MESSAGE = 'Only 1 drink can be ordered per device.';
export const DEVICE_ORDER_LOCK_MESSAGE = 'This device has already placed an order for this vendor today.';

// Device identity is now issued by the server as an HttpOnly cookie
// (smart_qr_device_id). The client no longer fabricates its own device id,
// so the old localStorage-based getOrCreateDeviceId has been removed.

export function getOrderLockKey(vendorKey: string) {
  return `smart_qr_order_lock_${vendorKey}`;
}

export function hasOrderLock(vendorKey: string) {
  if (!vendorKey) return false;
  try {
    return !!localStorage.getItem(getOrderLockKey(vendorKey));
  } catch {
    return false;
  }
}

export function saveOrderLock(vendorKey: string, orderId: string) {
  if (!vendorKey || !orderId) return;
  try {
    localStorage.setItem(
      getOrderLockKey(vendorKey),
      JSON.stringify({ orderId, createdAt: new Date().toISOString() })
    );
  } catch {}
}

export function getMaxDrinksOrderMessage(maxDrinksPerOrder: number) {
  const max = Math.max(1, Math.floor(Number(maxDrinksPerOrder) || 1));
  return max === 1 ? ONE_DRINK_ORDER_MESSAGE : `Maximum ${max} drink(s) per order.`;
}
