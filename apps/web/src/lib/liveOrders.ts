interface LiveOrder {
  id: string;
  status: string;
  customerName?: string | null;
  items: { id?: string; status?: string }[];
  event?: { status: string } | null;
}

export function belongsInKitchen(order: LiveOrder) {
  return (!order.event || order.event.status === 'ACTIVE') && order.status === 'PREPARING' && order.items.some((item) => item.status !== 'READY');
}

// READY is terminal; delayed socket/API responses must not undo committed progress.
export function mergeLiveOrder<T extends LiveOrder>(previous: T | undefined, incoming: T): T {
  if (!previous) return incoming;
  if (previous.status === 'READY' && incoming.status === 'PREPARING') return previous;
  return {
    ...incoming,
    customerName: incoming.customerName === undefined ? previous.customerName : incoming.customerName,
    items: incoming.items.map((item) => item.id && previous.items.some((old) =>
      old.id === item.id && old.status === 'READY') ? { ...item, status: 'READY' } : item),
  };
}

export function applyLiveOrder<T extends LiveOrder>(orders: T[], order: T, tab: 'kitchen' | 'ready'): T[] {
  order = mergeLiveOrder(orders.find((entry) => entry.id === order.id), order);
  const belongs = (!order.event || order.event.status === 'ACTIVE') &&
    (tab === 'kitchen' ? belongsInKitchen(order) : order.status === 'READY');
  if (!belongs) return orders.filter((entry) => entry.id !== order.id);
  return orders.some((entry) => entry.id === order.id)
    ? orders.map((entry) => entry.id === order.id ? order : entry)
    : [order, ...orders];
}
