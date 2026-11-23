import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { applyLiveOrder, belongsInKitchen, mergeLiveOrder } from '../../lib/liveOrders';
import { useSocket } from '../../context/SocketContext';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { toast } from 'react-hot-toast';
import { computeDisplayNumber } from '../../lib/utils';



interface OrderItem {
  id?: string;
  quantity: number;
  status?: 'PREPARING' | 'READY';
  remark?: string | null;
  selectedOptions?: any[] | null;
  menuItem: {
    id: string;
    name: string;
  };
}

interface Order {
  id: string;
  eventOrderNumber?: string | number | null;
  displayNumber?: string | number | null;
  status: string;
  paymentStatus?: string;
  customerName?: string | null;
  items: OrderItem[];
  createdAt: string;
  readyAt?: string | null;
  vendorId: string;
  event?: {
    id: string;
    eventName: string;
    eventDate: string;
    location?: string | null;
    status: string;
  } | null;
}

interface ProductionQueueItem {
  id: string;
  orderId: string;
  orderNumber: number;
  quantity: number;
  createdAt: string;
}
interface WaitingRecipe {
  signature: string;
  menuItemId: string;
  drinkName: string;
  selectedOptions: any[] | null;
  remark: string;
  totalQuantity: number;
  items: ProductionQueueItem[];
}
interface ProductionBatch {
  id: string;
  batchNumber: number;
  status: string;
  capacity: number;
  recipeSignature: string;
  drinkName: string;
  selectedOptions: any[] | null;
  remark: string;
  createdAt: string;
  totalCups: number;
  orders: { orderNumber: number; quantity: number }[];
}
interface ProductionQueue {
  eventId: string | null;
  defaultBatchSize: number;
  batches: ProductionBatch[];
  waitingGroups: WaitingRecipe[];
}

function allocatePreview(items: ProductionQueueItem[], capacity: number) {
  const selected: ProductionQueueItem[] = [];
  let cups = 0;
  for (const item of items) {
    if (!selected.length && item.quantity > capacity) break;
    if (cups + item.quantity > capacity) break;
    selected.push(item);
    cups += item.quantity;
  }
  return { items: selected, cups };
}

function optionText(options: any[] | null, remark = '') {
  const values = (Array.isArray(options) ? options : []).flatMap((group) => {
    return Array.isArray(group?.choices)
      ? group.choices.map((choice: any) => String(choice?.label || '').trim()).filter(Boolean)
      : [];
  });
  const cleanRemark = String(remark || '').trim();
  if (cleanRemark) values.push(`Note: ${cleanRemark}`);
  return values;
}

function cupLabel(quantity: number) {
  return `${quantity} cup${quantity === 1 ? '' : 's'}`;
}

export function VendorDashboard() {
  const { socket, isConnected } = useSocket();
  const [productionOrders, setProductionOrders] = useState<Order[]>([]);
  const [kitchenMode, setKitchenMode] = useState<'orders' | 'batches'>('orders');
  const [batchQueue, setBatchQueue] = useState<ProductionQueue>({ eventId: null, defaultBatchSize: 10, batches: [], waitingGroups: [] });
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  const [batchCapacity, setBatchCapacity] = useState(10);
  const [showIncludedOrders, setShowIncludedOrders] = useState(false);
  const [startingBatch, setStartingBatch] = useState(false);
  const [focusedBatchId, setFocusedBatchId] = useState<string | null>(null);
  const [focusedPage, setFocusedPage] = useState(0);
  const [seenPages, setSeenPages] = useState<Set<number>>(new Set([0]));
  const [confirmBatchReady, setConfirmBatchReady] = useState(false);
  const [completingBatch, setCompletingBatch] = useState(false);

  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  const retryAfterRef = useRef(0);
  const pendingRefreshRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(false);
  const requestAbortRef = useRef<AbortController>();
  const requestGenerationRef = useRef(0);
  const latestOrders = useRef(new Map<string, Order>());
  const updatesDuringFetch = useRef(new Map<string, Order>());
  const queueRequestGeneration = useRef(0);

  const [activeTab, setActiveTab] = useState<'kitchen' | 'history'>('kitchen');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [expandedHistoryEvents, setExpandedHistoryEvents] = useState<Set<string>>(new Set());
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const refreshProductionQueue = useCallback(async () => {
    const generation = ++queueRequestGeneration.current;
    setQueueLoading(true);
    try {
      const { data } = await api.get('/orders/vendor/production-queue', { timeout: 20000 });
      if (generation !== queueRequestGeneration.current || !data.success) return;
      setBatchQueue(data.data);
      setQueueError('');
      if (focusedBatchId && !data.data.batches.some((batch: ProductionBatch) => batch.id === focusedBatchId)) setFocusedBatchId(null);
    } catch (error: any) {
      if (generation === queueRequestGeneration.current) setQueueError(error?.response?.data?.error || 'Unable to load production queue.');
    } finally {
      if (generation === queueRequestGeneration.current) setQueueLoading(false);
    }
  }, [focusedBatchId]);

  const confirmCancellation = async () => {
    if (!cancelTarget || cancelling) return;
    setCancelling(true);
    try {
      const { data } = await api.post(`/orders/${cancelTarget.id}/cancel`);
      if (!data.success) throw new Error(data.error || 'Cancellation failed');
      applyOrder(data.data);
      setCancelTarget(null);
      toast.success(data.data.paymentStatus === 'PAID'
        ? `Order #${computeDisplayNumber(data.data)} cancelled. Payment requires reconciliation; no refund was issued.`
        : `Order #${computeDisplayNumber(data.data)} cancelled`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Failed to cancel order');
    } finally {
      setCancelling(false);
    }
  };

  const CancelButton = ({ order }: { order: Order }) => order.status === 'PREPARING' ? (
    <button onClick={() => setCancelTarget(order)} className={`${dangerActionButtonClass} w-full min-w-0`}>
      Cancel
    </button>
  ) : null;

  // Record committed changes so an older HTTP snapshot cannot overwrite them.
  const applyOrder = useCallback((order: Order) => {
    order = mergeLiveOrder(latestOrders.current.get(order.id), order);
    latestOrders.current.set(order.id, order);
    if (isFetchingRef.current) updatesDuringFetch.current.set(order.id, order);
    setProductionOrders((previous) => applyLiveOrder(previous, order, 'kitchen')
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
    setHistoryOrders((previous) => applyLiveOrder(previous, order, 'ready'));
  }, []);

  const refetchAll = useCallback(async (required = false) => {
    if (!mountedRef.current) return;
    if (isFetchingRef.current) {
      if (required || Date.now() - lastFetchRef.current >= 2000) pendingRefreshRef.current = true;
      return;
    }
    const now = Date.now();
    if (now < retryAfterRef.current) return;
    if (!required && now - lastFetchRef.current < 2000) return;
    isFetchingRef.current = true;
    lastFetchRef.current = now;
    clearTimeout(refreshTimerRef.current);
    updatesDuringFetch.current.clear();
    const generation = requestGenerationRef.current;
    const controller = new AbortController();
    requestAbortRef.current = controller;
    try {
      const { data } = await api.get('/orders/vendor-live', { timeout: 20000, signal: controller.signal });
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      if (data.success) {
        let kitchen: Order[] = (data.data || []).filter(belongsInKitchen);
        let ready: Order[] = (data.data || []).filter((order: Order) => order.status === 'READY');
        for (const order of updatesDuringFetch.current.values()) {
          kitchen = applyLiveOrder(kitchen, order, 'kitchen');
          ready = applyLiveOrder(ready, order, 'ready');
        }
        const reconciled = new Map([...kitchen, ...ready].map((order) => [order.id, order]));
        for (const [id, order] of latestOrders.current) {
          if (order.status === 'CANCELLED') reconciled.set(id, order);
        }
        latestOrders.current = reconciled;
        setProductionOrders(kitchen.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
        setHistoryOrders(ready);
      }
    } catch (error: any) {
      if (!mountedRef.current || generation !== requestGenerationRef.current) return;
      if (error.response?.status === 429) {
        retryAfterRef.current = Date.now() + 30000;
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = setTimeout(() => { void refetchAll(true); }, 30000);
        toast.error('Rate limited. Waiting 30s...');
      }
      console.error('Refetch error:', error);
    } finally {
      if (generation === requestGenerationRef.current) {
        isFetchingRef.current = false;
        if (pendingRefreshRef.current && mountedRef.current) {
          pendingRefreshRef.current = false;
          void refetchAll(true);
        }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refetchAll(true);
    return () => {
      mountedRef.current = false;
      requestGenerationRef.current++;
      requestAbortRef.current?.abort();
      isFetchingRef.current = false;
      pendingRefreshRef.current = false;
      clearTimeout(refreshTimerRef.current);
    };
  }, [refetchAll]);

  useEffect(() => {
    if (!socket) return;
    const onConnect = () => {
      void refetchAll(true);
      if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
    };
    const onCreated = (order: Order) => {
      applyOrder(order);
      toast.success('New Order Received!');
      if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
    };
    const onUpdated = (order: Order) => {
      applyOrder(order);
      if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
    };
    const onBatchChanged = () => { if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue(); };
    const onChanged = () => {
      void refetchAll(true);
      if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
    };
    socket.on('connect', onConnect);
    socket.on('order_created', onCreated);
    socket.on('order_updated', onUpdated);
    socket.on('production_batch_changed', onBatchChanged);
    socket.on('vendor_orders_changed', onChanged);
    return () => {
      socket.off('connect', onConnect);
      socket.off('order_created', onCreated);
      socket.off('order_updated', onUpdated);
      socket.off('production_batch_changed', onBatchChanged);
      socket.off('vendor_orders_changed', onChanged);
    };
  }, [socket, refetchAll, applyOrder, refreshProductionQueue, activeTab, kitchenMode]);

  useEffect(() => {
    const onFocus = () => { void refetchAll(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refetchAll();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refetchAll]);

  useEffect(() => {
    if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
  }, [activeTab, kitchenMode, refreshProductionQueue]);

  useEffect(() => {
    // Background tabs retain their data; visibility/focus reconciles on return.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refetchAll();
        if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
      }
    }, isConnected ? 300000 : 30000);
    return () => clearInterval(poll);
  }, [refetchAll, isConnected, kitchenMode, activeTab, refreshProductionQueue]);

  const markOrderReady = async (id: string) => {
    const res = await api.post(`/orders/${id}/items/mark-ready`);
    if (res.data.success) applyOrder(res.data.data);
  };

  const formatItemDetails = (it: OrderItem, simplified = false) => {
    const parts: string[] = [];
    const opts = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
    for (const s of opts) {
      const title = String(s?.title || '');
      const choices = Array.isArray(s?.choices) ? s.choices : [];
      const labels = choices.map((c: any) => String(c?.label || '')).filter(Boolean);
      if (!title || labels.length === 0) continue;
      if (simplified) {
        // In simplified mode (Kitchen View), we only show the selected values
        parts.push(...labels);
      } else {
        parts.push(`${title}: ${labels.join(', ')}`);
      }
    }
    const remark = String(it.remark || '').trim();
    if (remark) {
      // For remarks, we also simplify in simplified mode
      parts.push(simplified ? remark : `Note: ${remark}`);
    }
    return parts;
  };

  const optionTone = (detail: string) => {
    if (/^note:/i.test(detail.trim())) return 'bg-neutral-900 text-white';
    const label = detail.includes(':') ? detail.slice(detail.lastIndexOf(':') + 1).trim() : detail.trim();
    if (label.toLowerCase() === 'hot') return 'bg-red-600 text-white';
    if (label.toLowerCase() === 'cold') return 'bg-blue-600 text-white';
    return 'bg-neutral-900 text-white';
  };

  const orderStatusTone = (status: string) => status === 'READY'
    ? 'border-green-200 bg-green-50 text-green-700'
    : 'border-neutral-200 bg-neutral-50 text-neutral-600';

  const optionStackClass = 'mt-2.5 flex w-fit max-w-xs flex-col items-start gap-2.5';
  const optionChipClass = (detail: string) => `inline-flex w-full max-w-full items-center rounded-xl px-5 py-2.5 text-2xl font-bold leading-snug whitespace-normal break-words [overflow-wrap:anywhere] ${optionTone(detail)}`;
  const drinkTitleClass = 'font-bold text-2xl text-black break-words [overflow-wrap:anywhere]';
  const actionButtonClass = 'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
  const primaryActionButtonClass = `${actionButtonClass} bg-neutral-900 text-white hover:bg-neutral-800`;
  const dangerActionButtonClass = `${actionButtonClass} bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500`;
  const secondaryActionButtonClass = `${actionButtonClass} border border-neutral-200 bg-neutral-100 text-neutral-900 hover:bg-neutral-200`;

  const SingleOrderList = ({ data, mobile = false }: { data: Order[]; mobile?: boolean }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map((order) => {
        const itemCount = order.items?.length ?? 0;
        const isMultiType = itemCount > 1;

        return (
          <div key={order.id} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="flex justify-between items-start gap-3 mb-4">
              <div className="min-w-0 flex-1">
                {mobile ? <div className="text-3xl font-bold leading-tight text-black break-words [overflow-wrap:anywhere]">Order #{computeDisplayNumber(order)}</div> : <h3 className="text-3xl font-bold leading-tight text-black break-words [overflow-wrap:anywhere]">Order #{computeDisplayNumber(order)}</h3>}
                <p className="text-sm text-neutral-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
              </div>
              <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${orderStatusTone(order.status)}`}>
                {order.status}
              </div>
            </div>
            <div className="flex-1 space-y-4">
              {order.items.map((item, idx) => (
                <div key={idx} className="border-b border-neutral-50 pb-4 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className={drinkTitleClass}>
                        {item.quantity}x {item.menuItem.name}
                      </div>
                      {formatItemDetails(item, true).length > 0 && (
                        <div className={optionStackClass}>
                          {formatItemDetails(item, true).map((d, i) => (
                            <div key={i} className={optionChipClass(d)}>
                              {d}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {isMultiType && (
                      item.status !== 'READY' ? (
                        <button
                          onClick={async () => {
                            try {
                              const res = await api.post(`/orders/${order.id}/items/${item.id}/mark-ready`);
                              if (res.data.success) applyOrder(res.data.data);
                              if (res.data.success && res.data.data.status === 'READY') {
                                toast.success('Order is fully ready!');
                              } else {
                                toast.success(`${item.menuItem.name} marked ready`);
                              }
                            } catch (e: any) {
                              toast.error(e?.response?.data?.error || 'Failed to mark ready');
                            }
                          }}
                          className={`${primaryActionButtonClass} ml-3 shrink-0 px-3 text-xs`}
                        >
                          Ready
                        </button>
                      ) : (
                        <span className="ml-4 text-green-600 text-xs font-bold uppercase shrink-0">✓ Ready</span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
            {!isMultiType && order.status === 'PREPARING' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <CancelButton order={order} />
                <button
                  onClick={async () => {
                    try {
                      await markOrderReady(order.id);
                      toast.success('Order is fully ready!');
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error || 'Failed to mark ready');
                    }
                  }}
                  className={`${primaryActionButtonClass} w-full min-w-0 min-h-12 px-3 py-3`}
                >
                  Ready
                </button>
              </div>
            )}
            {isMultiType && order.status !== 'READY' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <CancelButton order={order} />
                <button
                  onClick={async () => {
                    try {
                      await markOrderReady(order.id);
                      toast.success('Order items marked ready');
                    } catch (e: any) {
                      toast.error(e?.response?.data?.error || 'Failed to mark ready');
                    }
                  }}
                  className={`${primaryActionButtonClass} min-h-12 w-full min-w-0 px-3 py-3`}
                >
                  Ready
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const HistoryOrderList = ({ data }: { data: Order[] }) => {
    const groups = new Map<string, { event: NonNullable<Order['event']> | null; orders: Order[] }>();
    for (const order of data) {
      const fallbackDate = order.createdAt.slice(0, 10);
      const key = order.event?.id || `historical-${fallbackDate}`;
      const existing = groups.get(key);
      if (existing) existing.orders.push(order);
      else groups.set(key, { event: order.event || null, orders: [order] });
    }

    const eventGroups = Array.from(groups.entries())
      .map(([key, group]) => ({
        key,
        ...group,
        cups: group.orders.reduce((sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0),
        newestReadyTime: Math.max(...group.orders.map((order) => new Date(order.readyAt || order.createdAt).getTime())),
      }))
      .sort((a, b) => {
        const aDate = a.event?.eventDate ? new Date(a.event.eventDate).getTime() : a.newestReadyTime;
        const bDate = b.event?.eventDate ? new Date(b.event.eventDate).getTime() : b.newestReadyTime;
        return bDate - aDate || b.newestReadyTime - a.newestReadyTime;
      });

    if (eventGroups.length === 0) return <div className="text-sm text-neutral-600">No previous orders.</div>;

    return <div className="space-y-4">
      {eventGroups.map((group) => {
        const expanded = expandedHistoryEvents.has(group.key);
        const eventDateValue = group.event?.eventDate || group.orders[0].createdAt;
        const formattedDate = new Date(eventDateValue).toLocaleDateString('en-MY', {
          timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'long', year: 'numeric',
        });
        const eventName = group.event?.eventName?.trim() || formattedDate;
        const sortedOrders = [...group.orders].sort((a, b) =>
          new Date(b.readyAt || b.createdAt).getTime() - new Date(a.readyAt || a.createdAt).getTime(),
        );
        return <section key={group.key} className="rounded-2xl border border-neutral-200 bg-white p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="font-bold text-black">Event: {eventName} — {formattedDate}</h3>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-neutral-500">
                <span>{group.orders.length} ready orders</span>
                <span>{group.cups} cups</span>
              </div>
            </div>
            <button
              onClick={() => setExpandedHistoryEvents((current) => {
                const next = new Set(current);
                if (next.has(group.key)) next.delete(group.key);
                else next.add(group.key);
                return next;
              })}
              className={secondaryActionButtonClass}
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {expanded && <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sortedOrders.map((order) => <article key={order.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-3xl font-bold leading-tight text-black break-words [overflow-wrap:anywhere]">Order #{order.eventOrderNumber ?? order.displayNumber}</div>
                  <div className="text-xs text-neutral-500">
                    Ready {new Date(order.readyAt || order.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
                  </div>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold tracking-wide ${orderStatusTone('READY')}`}>READY</span>
              </div>
              <div className="mt-3 space-y-3">
                {order.items.map((item, index) => <div key={item.id || index} className="text-sm">
                  <div className="flex justify-between gap-3 font-bold text-2xl"><span className="min-w-0 break-words [overflow-wrap:anywhere]">{item.quantity}x {item.menuItem.name}</span><span className="shrink-0 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-green-700">{item.status || 'READY'}</span></div>
                  <div className={optionStackClass}>{formatItemDetails(item).map((detail, detailIndex) => <div key={detailIndex} className={optionChipClass(detail)}>{detail}</div>)}</div>
                </div>)}
              </div>
            </article>)}
          </div>}
        </section>;
      })}
    </div>;
  };

  const selectedWaitingGroup = batchQueue.waitingGroups.find((group) => group.signature === selectedRecipe) || null;
  const preview = selectedWaitingGroup ? allocatePreview(selectedWaitingGroup.items, batchCapacity) : { items: [], cups: 0 };
  const previewRemaining = selectedWaitingGroup ? selectedWaitingGroup.totalQuantity - preview.cups : 0;
  const includedOrders = Array.from(preview.items.reduce((map, item) => {
    map.set(item.orderNumber, (map.get(item.orderNumber) || 0) + item.quantity);
    return map;
  }, new Map<number, number>()).entries()).map(([orderNumber, quantity]) => ({ orderNumber, quantity }));
  const focusedBatch = batchQueue.batches.find((batch) => batch.id === focusedBatchId) || null;
  const focusPages = focusedBatch ? Math.ceil(focusedBatch.orders.length / 10) : 0;
  const focusPageOrders = focusedBatch ? focusedBatch.orders.slice(focusedPage * 10, focusedPage * 10 + 10) : [];
  const allFocusPagesSeen = focusPages <= 1 || Array.from({ length: focusPages }, (_, index) => index).every((index) => seenPages.has(index));

  const openBatch = (batchId: string) => {
    setFocusedBatchId(batchId);
    setFocusedPage(0);
    setSeenPages(new Set([0]));
    setConfirmBatchReady(false);
  };

  const startSelectedBatch = async () => {
    if (!selectedWaitingGroup || preview.items.length === 0 || startingBatch) return;
    setStartingBatch(true);
    try {
      const { data } = await api.post('/orders/vendor/production-batches', {
        signature: selectedWaitingGroup.signature,
        capacity: batchCapacity,
        orderItemIds: preview.items.map((item) => item.id),
      });
      if (!data.success) throw new Error(data.error || 'Unable to start batch');
      setBatchQueue(data.data.queue);
      setSelectedRecipe(null);
      setShowIncludedOrders(false);
      openBatch(data.data.batch.id);
      toast.success(`Batch #${data.data.batch.batchNumber} started`);
    } catch (error: any) {
      if (error?.response?.status === 409) {
        void refreshProductionQueue();
        toast.error('The waiting queue changed. Review the updated allocation before starting.');
      } else {
        toast.error(error?.response?.data?.error || error?.message || 'Unable to start batch');
      }
    } finally {
      setStartingBatch(false);
    }
  };

  const completeFocusedBatch = async () => {
    if (!focusedBatch || completingBatch) return;
    if (focusPages > 1 && !allFocusPagesSeen) return;
    if (focusPages > 1 && !confirmBatchReady) {
      setConfirmBatchReady(true);
      return;
    }
    setCompletingBatch(true);
    try {
      const { data } = await api.post(`/orders/vendor/production-batches/${focusedBatch.id}/ready`);
      if (!data.success) throw new Error(data.error || 'Unable to complete batch');
      data.data.orders.forEach(applyOrder);
      setBatchQueue(data.data.queue);
      setFocusedBatchId(null);
      setConfirmBatchReady(false);
      toast.success(`Batch #${focusedBatch.batchNumber} marked ready`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Unable to complete batch');
      void refreshProductionQueue();
    } finally {
      setCompletingBatch(false);
    }
  };

  const BatchOptions = ({ options, remark }: { options: any[] | null; remark?: string }) => {
    const details = optionText(options, remark);
    return details.length ? <div className="mt-1 flex min-w-0 max-w-full flex-wrap gap-1">{details.map((detail, index) => <span key={index} className={`inline-flex max-w-full break-words rounded-md px-2 py-1 text-xs font-semibold [overflow-wrap:anywhere] ${optionTone(detail)}`}>{detail}</span>)}</div> : null;
  };

  const BatchQueueView = () => (
    <div className="space-y-5">
      {queueError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{queueError}</div>}
      {!batchQueue.eventId && <div className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-600">No active event.</div>}
      <section>
        <h2 className="mb-2 text-lg font-bold text-neutral-900">Preparing Batches</h2>
        {batchQueue.batches.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-neutral-500">No batches are being prepared.</p> :
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {batchQueue.batches.map((batch) => <article key={batch.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <div className="flex items-start justify-between gap-2"><div><div className="text-sm font-bold">Batch #{batch.batchNumber} · {batch.drinkName}</div><BatchOptions options={batch.selectedOptions} remark={batch.remark} /></div><span className="shrink-0 rounded-full bg-amber-200 px-2 py-1 text-[10px] font-bold text-amber-900">PREPARING</span></div>
              <div className="mt-2 text-xs font-semibold text-neutral-700">{cupLabel(batch.totalCups)} · {batch.orders.length} {batch.orders.length === 1 ? 'order' : 'orders'}</div>
              <button onClick={() => openBatch(batch.id)} className={`${primaryActionButtonClass} mt-2 w-full`}>Open Batch</button>
            </article>)}
          </div>}
      </section>
      <section>
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-bold text-neutral-900">Waiting Queue</h2>{queueLoading && <span className="text-xs text-neutral-500">Updating…</span>}</div>
        {batchQueue.waitingGroups.length === 0 ? <p className="rounded-xl bg-white p-4 text-sm text-neutral-500">No drinks waiting for preparation.</p> :
          <div className="space-y-2">
            {batchQueue.waitingGroups.map((group) => <article key={group.signature} className="rounded-xl border border-neutral-200 bg-white p-3">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="break-words font-bold text-neutral-950 [overflow-wrap:anywhere]">{group.drinkName}</div><BatchOptions options={group.selectedOptions} remark={group.remark} /></div><div className="shrink-0 whitespace-nowrap text-right text-lg font-bold">{cupLabel(group.totalQuantity)}</div></div>
              <button onClick={() => { setSelectedRecipe(group.signature); setBatchCapacity(batchQueue.defaultBatchSize); setShowIncludedOrders(false); }} className={`${secondaryActionButtonClass} mt-2 w-full`}>Start Batch</button>
            </article>)}
          </div>}
      </section>
    </div>
  );

  const cancellationModal = <Modal isOpen={!!cancelTarget} onClose={() => { if (!cancelling) setCancelTarget(null); }} title={`Cancel Order #${cancelTarget ? computeDisplayNumber(cancelTarget) : ''}?`}>
    <p className="text-sm text-neutral-600">Are you sure you want to cancel this order? The order will be removed from Kitchen View, and its cancellation record will be retained.</p>
    {cancelTarget?.paymentStatus === 'PAID' && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">This order is marked paid. Cancellation will not issue a refund; reconcile the payment separately.</p>}
    <div className="mt-6 flex justify-end gap-2">
      <Button disabled={cancelling} onClick={() => setCancelTarget(null)} className={secondaryActionButtonClass}>Keep Order</Button>
      <Button disabled={cancelling} isLoading={cancelling} className={dangerActionButtonClass} onClick={confirmCancellation}>Confirm Cancel</Button>
    </div>
  </Modal>;

  if (focusedBatch) return <>
    {cancellationModal}
    <main className="fixed inset-0 z-40 flex h-[100dvh] flex-col overflow-hidden bg-white px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 pb-2">
        <button onClick={() => { setFocusedBatchId(null); setConfirmBatchReady(false); }} className={secondaryActionButtonClass}>← Queue</button>
        <div className="text-center"><div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Batch #{focusedBatch.batchNumber}</div><div className="text-sm font-bold">{cupLabel(focusedBatch.totalCups)} · PREPARING</div></div>
        <div className="w-[74px]" />
      </header>
      <section className="shrink-0 py-2">
        <h1 className="text-xl font-bold leading-tight text-neutral-950">{focusedBatch.drinkName}</h1>
        <BatchOptions options={focusedBatch.selectedOptions} remark={focusedBatch.remark} />
      </section>
      <section className="grid min-h-0 flex-1 grid-cols-2 grid-rows-5 gap-2" aria-label="Batch order numbers">
        {focusPageOrders.map((order) => <div key={order.orderNumber} className="flex min-h-0 items-center justify-between gap-1 rounded-lg border border-neutral-300 bg-neutral-50 px-2">
          <span className="min-w-0 break-words text-[20px] font-extrabold leading-tight text-black sm:text-2xl">#{order.orderNumber}</span>
          <span className="shrink-0 text-xs font-semibold text-neutral-700 sm:text-sm">{order.quantity} cup{order.quantity === 1 ? '' : 's'}</span>
        </div>)}
      </section>
      <footer className="mt-2 flex shrink-0 items-center gap-2 border-t border-neutral-200 pt-2">
        {focusPages > 1 && <>
          <button disabled={focusedPage === 0} onClick={() => { const page = focusedPage - 1; setFocusedPage(page); setSeenPages((seen) => new Set(seen).add(page)); setConfirmBatchReady(false); }} className={`${secondaryActionButtonClass} px-3`}>Prev</button>
          <span className="min-w-12 text-center text-xs font-semibold">{focusedPage + 1} of {focusPages}</span>
          <button disabled={focusedPage + 1 >= focusPages} onClick={() => { const page = focusedPage + 1; setFocusedPage(page); setSeenPages((seen) => new Set(seen).add(page)); setConfirmBatchReady(false); }} className={`${secondaryActionButtonClass} px-3`}>Next</button>
        </>}
        <button onClick={() => void completeFocusedBatch()} disabled={completingBatch || (focusPages > 1 && !allFocusPagesSeen)} className={`${primaryActionButtonClass} ml-auto min-h-12 flex-1 px-3`}>
          {completingBatch ? 'Completing…' : focusPages > 1 && !allFocusPagesSeen ? 'Review every page' : confirmBatchReady ? 'Confirm Ready' : 'Ready'}
        </button>
        {confirmBatchReady && <button onClick={() => setConfirmBatchReady(false)} className={secondaryActionButtonClass}>Back</button>}
      </footer>
    </main>
  </>;

  return (
    <>
      {cancellationModal}
      <Modal isOpen={!!selectedRecipe} onClose={() => { if (!startingBatch) setSelectedRecipe(null); }} title={selectedWaitingGroup?.drinkName || 'Batch'} mobileFullScreen>
        {selectedWaitingGroup && <div className="min-w-0 space-y-5">
          <BatchOptions options={selectedWaitingGroup.selectedOptions} remark={selectedWaitingGroup.remark} />
          <section className="flex items-center justify-between border-b border-neutral-100 pb-4">
            <span className="text-sm font-medium text-neutral-700">Waiting</span>
            <span className="text-xl font-bold text-neutral-950">{cupLabel(selectedWaitingGroup.totalQuantity)}</span>
          </section>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><h3 className="text-sm font-semibold text-neutral-900">Batch Capacity</h3><p className="text-xs text-neutral-500">Maximum cups</p></div>
              <div className="flex min-w-0 items-center gap-2">
                <button onClick={() => setBatchCapacity((capacity) => Math.max(1, capacity - 1))} className={`${secondaryActionButtonClass} h-10 min-h-10 w-10 shrink-0 px-0 text-lg`} aria-label="Decrease capacity">−</button>
                <input type="number" min={1} max={10000} value={batchCapacity} onChange={(event) => setBatchCapacity(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))} className="h-10 min-w-0 w-16 rounded-xl border border-neutral-200 text-center font-semibold sm:w-20" aria-label="Batch capacity in cups" />
                <button onClick={() => setBatchCapacity((capacity) => Math.min(10000, capacity + 1))} className={`${secondaryActionButtonClass} h-10 min-h-10 w-10 shrink-0 px-0 text-lg`} aria-label="Increase capacity">+</button>
              </div>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <div className="min-w-0 rounded-xl bg-neutral-100 p-3"><div className="text-xs text-neutral-500">To Prepare</div><div className="mt-1 break-words text-xl font-bold text-neutral-950">{cupLabel(preview.cups)}</div></div>
            <div className="min-w-0 rounded-xl bg-neutral-100 p-3"><div className="text-xs text-neutral-500">Remaining</div><div className="mt-1 break-words text-xl font-bold text-neutral-950">{cupLabel(previewRemaining)}</div></div>
          </section>
          {preview.cups === 0 && selectedWaitingGroup.items[0] && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Increase capacity to at least {cupLabel(selectedWaitingGroup.items[0].quantity)} to include the oldest order.</p>}
          <section>
            <button type="button" aria-expanded={showIncludedOrders} onClick={() => setShowIncludedOrders((visible) => !visible)} className={`${secondaryActionButtonClass} w-full justify-between text-left`}>
              <span>Orders ({includedOrders.length})</span>
            </button>
            {showIncludedOrders && <div className="mt-2 max-h-40 overflow-y-auto"><div className="mb-1 text-xs font-semibold text-neutral-500">Order Numbers</div><ul className="space-y-1 text-sm">{includedOrders.map((order) => <li key={order.orderNumber} className="rounded-lg bg-neutral-50 px-3 py-2">Order #{order.orderNumber} — {cupLabel(order.quantity)}</li>)}</ul></div>}
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-2"><Button disabled={startingBatch} onClick={() => setSelectedRecipe(null)} className={`${secondaryActionButtonClass} min-w-0 px-2`}>Cancel</Button><Button disabled={startingBatch || preview.cups === 0} isLoading={startingBatch} onClick={startSelectedBatch} className={`${primaryActionButtonClass} min-w-0 px-2`}>Start {preview.cups} {preview.cups === 1 ? 'Cup' : 'Cups'}</Button></div>
        </div>}
      </Modal>
      <div className="block [@media(pointer:coarse)]:hidden container mx-auto p-6 h-[calc(100vh-64px)] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Live Orders</h1>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border bg-white overflow-hidden p-1 mr-4">
              <button
                onClick={() => setActiveTab('kitchen')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                  activeTab === 'kitchen' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                Kitchen View
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                  activeTab === 'history' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                Ready Orders
              </button>
            </div>
            <Button
              variant="outline"
              className={secondaryActionButtonClass}
              onClick={() => {
                refetchAll();
                if (activeTab === 'kitchen' && kitchenMode === 'batches') void refreshProductionQueue();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        {activeTab === 'kitchen' && <div className="mb-3 inline-flex w-fit rounded-lg border bg-white p-1">
          <button onClick={() => setKitchenMode('orders')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${kitchenMode === 'orders' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>Order View</button>
          <button onClick={() => setKitchenMode('batches')} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${kitchenMode === 'batches' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>Batch Queue</button>
        </div>}
        <div className="mt-4 flex-1 overflow-y-auto">
          {activeTab === 'kitchen' ? (
            kitchenMode === 'batches' ? <BatchQueueView /> : productionOrders.length === 0 ? <p>No live orders.</p> : <SingleOrderList data={productionOrders} />
          ) : (
            <HistoryOrderList data={historyOrders} />
          )}
        </div>
      </div>

      <div className="hidden [@media(pointer:coarse)]:flex flex-col min-h-[100dvh] bg-neutral-50 px-4 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Vendor</div>
            <div className="text-2xl font-semibold text-black">Live Orders</div>
          </div>
          <button
            onClick={() => {
              refetchAll();
            }}
            className={`${secondaryActionButtonClass} shrink-0`}
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-2xl border border-neutral-200 bg-white overflow-hidden p-1">
          <button
            onClick={() => setActiveTab('kitchen')}
            className={`flex-1 h-11 px-6 rounded-xl text-sm font-bold transition ${
              activeTab === 'kitchen' ? 'bg-black text-white shadow-lg' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Kitchen
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 h-11 px-6 rounded-xl text-sm font-bold transition ${
              activeTab === 'history' ? 'bg-black text-white shadow-lg' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            Ready
          </button>
        </div>

        {activeTab === 'kitchen' && <div className="mt-3 inline-flex w-full rounded-xl border border-neutral-200 bg-white p-1">
          <button onClick={() => setKitchenMode('orders')} className={`h-10 flex-1 rounded-xl text-sm font-bold transition ${kitchenMode === 'orders' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>Order View</button>
          <button onClick={() => setKitchenMode('batches')} className={`h-10 flex-1 rounded-xl text-sm font-bold transition ${kitchenMode === 'batches' ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}>Batch Queue</button>
        </div>}

        <div className="mt-4 flex-1 overflow-y-auto">
          {activeTab === 'kitchen' ? (
            kitchenMode === 'batches' ? <BatchQueueView /> : productionOrders.length === 0 ? <div className="text-sm text-neutral-600">No live orders.</div> : <SingleOrderList data={productionOrders} mobile />
          ) : (
            <HistoryOrderList data={historyOrders} />
          )}
        </div>
      </div>
    </>
  );
}
