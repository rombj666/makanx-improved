interface LiveOrder {
  id: string;
  status: string;
  items: { status?: string }[];
}

export function belongsInKitchen(order: LiveOrder) {
  return order.status === 'PREPARING' && order.items.some((item) => item.status !== 'READY');
}

export function applyLiveOrder<T extends LiveOrder>(orders: T[], order: T, tab: 'kitchen' | 'ready'): T[] {
  const belongs = tab === 'kitchen' ? belongsInKitchen(order) : order.status === 'READY';
  if (!belongs) return orders.filter((entry) => entry.id !== order.id);
  return orders.some((entry) => entry.id === order.id)
    ? orders.map((entry) => entry.id === order.id ? order : entry)
    : [order, ...orders];
}
