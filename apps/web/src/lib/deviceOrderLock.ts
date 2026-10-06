export const ONE_DRINK_ORDER_MESSAGE = 'Only 1 drink can be ordered per device.';
// Ordering eligibility is enforced by the server device cookie and database.
// Legacy smart_qr_order_lock_* localStorage entries are intentionally ignored.

export function getMaxDrinksOrderMessage(maxDrinksPerOrder: number) {
  const max = Math.max(1, Math.floor(Number(maxDrinksPerOrder) || 1));
  return max === 1 ? ONE_DRINK_ORDER_MESSAGE : `Maximum ${max} drink(s) per order.`;
}
