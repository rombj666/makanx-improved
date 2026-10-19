import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { applyLiveOrder, belongsInKitchen, mergeLiveOrder } from '../../lib/liveOrders';
import { useSocket } from '../../context/SocketContext';
import { Button } from '../../components/ui/Button';
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

export function VendorDashboard() {
  const { socket, isConnected } = useSocket();
  const [groupByWindow, setGroupByWindow] = useState(false);
  const [groupMinutes, setGroupMinutes] = useState(2);
  const [productionOrders, setProductionOrders] = useState<Order[]>([]);

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

  const [activeTab, setActiveTab] = useState<'kitchen' | 'history'>('kitchen');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [expandedHistoryEvents, setExpandedHistoryEvents] = useState<Set<string>>(new Set());

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
        latestOrders.current = new Map([...kitchen, ...ready].map((order) => [order.id, order]));
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

  const groupedProduction = useMemo(() => {
    const windowMs = groupMinutes * 60 * 1000;
    const grouped = new Map<number, Order[]>();

    for (const order of productionOrders) {
      const orderTime = new Date(order.createdAt).getTime();
      const bucket = Math.floor(orderTime / windowMs);
      const windowStart = bucket * windowMs;
      const existing = grouped.get(windowStart);
      if (existing) {
        existing.push(order);
      } else {
        grouped.set(windowStart, [order]);
      }
    }

    return Array.from(grouped.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([windowStart, ordersInWindow]) => ({
        windowStart,
        windowEnd: windowStart + windowMs,
        orders: ordersInWindow,
      }));
  }, [productionOrders, groupMinutes]);

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
    const onConnect = () => { void refetchAll(true); };
    const onCreated = (order: Order) => {
      applyOrder(order);
      toast.success('New Order Received!');
    };
    const onUpdated = (order: Order) => applyOrder(order);
    const onChanged = () => { void refetchAll(true); };
    socket.on('connect', onConnect);
    socket.on('order_created', onCreated);
    socket.on('order_updated', onUpdated);
    socket.on('vendor_orders_changed', onChanged);
    return () => {
      socket.off('connect', onConnect);
      socket.off('order_created', onCreated);
      socket.off('order_updated', onUpdated);
      socket.off('vendor_orders_changed', onChanged);
    };
  }, [socket, refetchAll, applyOrder]);

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
    // Background tabs retain their data; visibility/focus reconciles on return.
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void refetchAll();
    }, isConnected ? 300000 : 30000);
    return () => clearInterval(poll);
  }, [refetchAll, isConnected]);

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
        parts.push(labels.join(', '));
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

  const preparationKey = (it: OrderItem) => {
    const remark = String(it.remark || '').trim();
    const opts = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
    const normalizedOpts = opts
      .map((s: any) => {
        const groupId = String(s?.groupId || '');
        const title = String(s?.title || '');
        const choices = Array.isArray(s?.choices) ? s.choices : [];
        const normalizedChoices = choices
          .map((c: any) => ({
            id: String(c?.id || ''),
            label: String(c?.label || ''),
          }))
          .filter((c: any) => c.id || c.label)
          .sort((a: any, b: any) => (a.id || a.label).localeCompare(b.id || b.label));
        return { groupId, title, choices: normalizedChoices };
      })
      .filter((s: any) => s.groupId || s.title || (Array.isArray(s.choices) && s.choices.length > 0))
      .sort((a: any, b: any) => (a.groupId || a.title).localeCompare(b.groupId || b.title));
    return `${it.menuItem.id}::${remark}::${JSON.stringify(normalizedOpts)}`;
  };

  const GroupedProduction = ({
    data,
    showWindowHeader = true,
  }: {
    data: { windowStart: number; windowEnd: number; orders: Order[] }[];
    showWindowHeader?: boolean;
  }) => {
    return (
      <>
        {data.map((block) => {
          const bySignature = new Map<
            string,
            {
              menuItemId: string;
              name: string;
              qty: number;
              selectedOptions: any[];
              remark: string;
              details: string[];
            }
          >();
          for (const o of block.orders) {
            for (const it of o.items) {
              const key = preparationKey(it);
              const node = bySignature.get(key);
              if (node) {
                node.qty += Number(it.quantity || 0);
              } else {
                const remark = String(it.remark || '').trim();
                const selectedOptions = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
                bySignature.set(key, {
                  menuItemId: it.menuItem.id,
                  name: it.menuItem.name,
                  qty: Number(it.quantity || 0),
                  selectedOptions,
                  remark,
                  details: formatItemDetails(it),
                });
              }
            }
          }
          const aggregated = Array.from(bySignature.entries()).map(([key, v]) => ({
            key,
            menuItemId: v.menuItemId,
            name: v.name,
            quantity: v.qty,
            selectedOptions: v.selectedOptions,
            remark: v.remark,
            details: v.details,
          }));
          const windowStartISO = new Date(block.windowStart).toISOString();
          const windowEndISO = new Date(block.windowEnd).toISOString();
          return (
            <div key={block.windowStart} className="mb-6">
              {showWindowHeader ? (
                <h4 className="font-bold text-lg mb-2">
                  {new Date(block.windowStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} -{' '}
                  {new Date(block.windowEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </h4>
              ) : null}
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {block.orders.map((order) => (
                  <div key={order.id} className="min-w-0 rounded-xl border border-neutral-100 bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-black">Order #{computeDisplayNumber(order)}</div>
                        <p className="break-words text-sm font-semibold text-neutral-800 [overflow-wrap:anywhere]">{order.customerName?.trim() || '—'}</p>
                        <div className="text-xs text-neutral-500">{new Date(order.createdAt).toLocaleTimeString()}</div>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-neutral-700">{order.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {aggregated.map((it) => (
                  <li key={it.key} className="flex items-start justify-between rounded border p-3 bg-white gap-4">
                    <div className="min-w-0">
                      <div>
                        <span className="font-bold text-lg">{it.name}</span>{' '}
                        <span className="font-extrabold text-xl">x{it.quantity}</span>
                      </div>
                      {formatItemDetails({ selectedOptions: it.selectedOptions, remark: it.remark, menuItem: { id: it.menuItemId, name: it.name }, quantity: it.quantity }, true).length > 0 ? (
                        <div className="mt-2 text-lg text-black font-bold space-y-2">
                          {formatItemDetails({ selectedOptions: it.selectedOptions, remark: it.remark, menuItem: { id: it.menuItemId, name: it.name }, quantity: it.quantity }, true).map((d, idx) => (
                            <div key={idx} className="whitespace-normal break-words leading-tight bg-neutral-200 px-3 py-2 rounded-lg">
                              {d}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      className="bg-green-600 text-white shrink-0 w-[100px]"
                      onClick={async () => {
                        try {
                          const res = await api.post('/orders/vendor/production/mark-ready', {
                            menuItemId: it.menuItemId,
                            windowStart: windowStartISO,
                            windowEnd: windowEndISO,
                            selectedOptions: it.selectedOptions,
                            remark: it.remark,
                          });
                          if (res.data.success) res.data.orders.forEach(applyOrder);
                          toast.success(`${it.name} marked ready`);
                        } catch (e: any) {
                          toast.error(e?.response?.data?.error || 'Failed to mark ready');
                        }
                      }}
                    >
                      Ready
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </>
    );
  };

  const SingleOrderList = ({ data }: { data: Order[] }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map((order) => {
        const itemCount = order.items?.length ?? 0;
        const isMultiType = itemCount > 1;

        return (
          <div key={order.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 flex flex-col">
            <div className="flex justify-between items-start gap-3 mb-4">
              <div className="min-w-0 flex-1">
                <h3 className="text-xl font-bold text-black">Order #{computeDisplayNumber(order)}</h3>
                <p className="break-words text-sm font-semibold text-neutral-800 [overflow-wrap:anywhere]">{order.customerName?.trim() || '—'}</p>
                <p className="text-sm text-neutral-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
              </div>
              <div className="shrink-0 px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-bold uppercase">
                {order.status}
              </div>
            </div>
            <div className="flex-1 space-y-4">
              {order.items.map((item, idx) => (
                <div key={idx} className="border-b border-neutral-50 pb-4 last:border-0 last:pb-0">
                  <div className="flex justify-between items-start">
                    <div className="min-w-0">
                      <div className="font-bold text-lg text-black">
                        {item.quantity}x {item.menuItem.name}
                      </div>
                      {formatItemDetails(item, true).length > 0 && (
                        <div className="mt-2 space-y-1">
                          {formatItemDetails(item, true).map((d, i) => (
                            <div key={i} className="text-sm bg-neutral-100 px-2 py-1 rounded text-neutral-700">
                              {d}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {(isMultiType || itemCount === 1) && (
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
                          className="ml-4 px-3 py-1 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-black transition"
                        >
                          Mark Ready
                        </button>
                      ) : (
                        <span className="ml-4 text-green-600 text-xs font-bold uppercase shrink-0">✓ Ready</span>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
            {isMultiType && order.status !== 'READY' && (
              <button
                onClick={async () => {
                  try {
                    await markOrderReady(order.id);
                    toast.success('Order items marked ready');
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error || 'Failed to mark ready');
                  }
                }}
                className="mt-4 w-full h-12 rounded-2xl font-semibold bg-black text-white active:scale-[0.99] transition"
              >
                Ready
              </button>
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
        return <section key={group.key} className="rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
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
              className="h-10 rounded-xl border border-neutral-200 px-4 text-sm font-semibold"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
          {expanded && <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {sortedOrders.map((order) => <article key={order.id} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-black">Order #{order.eventOrderNumber ?? order.displayNumber}</div>
                  <p className="break-words text-sm font-semibold text-neutral-800 [overflow-wrap:anywhere]">{order.customerName?.trim() || '—'}</p>
                  <div className="text-xs text-neutral-500">
                    Ready {new Date(order.readyAt || order.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
                  </div>
                </div>
                <span className="rounded-full border border-green-100 bg-green-50 px-2.5 py-1 text-[10px] font-bold text-green-700">READY</span>
              </div>
              <div className="mt-3 space-y-3">
                {order.items.map((item, index) => <div key={item.id || index} className="text-sm">
                  <div className="flex justify-between gap-3 font-semibold"><span>{item.quantity}x {item.menuItem.name}</span><span className="text-green-700">{item.status || 'READY'}</span></div>
                  {formatItemDetails(item).map((detail, detailIndex) => <div key={detailIndex} className="mt-1 text-xs text-neutral-500">{detail}</div>)}
                </div>)}
              </div>
            </article>)}
          </div>}
        </section>;
      })}
    </div>;
  };

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden container mx-auto p-6 h-[calc(100vh-64px)] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Live Orders</h1>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-lg border bg-white overflow-hidden p-1 mr-4">
              <button
                onClick={() => setActiveTab('kitchen')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                  activeTab === 'kitchen' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                Kitchen View
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-4 py-2 rounded-md text-sm font-semibold transition ${
                  activeTab === 'history' ? 'bg-black text-white' : 'text-neutral-600 hover:bg-neutral-50'
                }`}
              >
                Ready Orders
              </button>
            </div>
            <select
              value={groupMinutes}
              onChange={(e) => setGroupMinutes(Number(e.target.value))}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm"
            >
              <option value={1}>1 min</option>
              <option value={2}>2 min</option>
              <option value={5}>5 min</option>
            </select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-gray-300"
                checked={groupByWindow}
                onChange={(e) => setGroupByWindow(e.target.checked)}
              />
              Group production by {groupMinutes}-minute windows
            </label>
            <Button
              variant="outline"
              onClick={() => {
                refetchAll();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 flex-1 overflow-y-auto">
          {activeTab === 'kitchen' ? (
            <>
              {groupByWindow && groupedProduction.length === 0 && <p>No grouped production data.</p>}
              {!groupByWindow && productionOrders.length === 0 && <p>No live orders.</p>}
              {groupByWindow && <GroupedProduction data={groupedProduction} />}
              {!groupByWindow && <SingleOrderList data={productionOrders} />}
            </>
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
            className="shrink-0 h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm active:scale-[0.99] transition"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-2xl border border-neutral-200 bg-white overflow-hidden p-1">
          <button
            onClick={() => setActiveTab('kitchen')}
            className={`flex-1 h-11 px-6 rounded-xl text-sm font-bold transition ${
              activeTab === 'kitchen' ? 'bg-black text-white shadow-lg' : 'text-neutral-600'
            }`}
          >
            Kitchen
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 h-11 px-6 rounded-xl text-sm font-bold transition ${
              activeTab === 'history' ? 'bg-black text-white shadow-lg' : 'text-neutral-600'
            }`}
          >
            Ready
          </button>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="flex flex-col gap-3 [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:items-center">
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-black">
              <span>Group by time window</span>
              <input
                type="checkbox"
                className="rounded border-neutral-300"
                checked={groupByWindow}
                onChange={(e) => setGroupByWindow(e.target.checked)}
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-black">Window</div>
              <select
                value={groupMinutes}
                onChange={(e) => setGroupMinutes(Number(e.target.value))}
                className="h-11 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-black"
              >
                <option value={1}>1 min</option>
                <option value={2}>2 min</option>
                <option value={5}>5 min</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto">
          {activeTab === 'kitchen' ? (
            groupByWindow ? (
              groupedProduction.length === 0 ? (
                <div className="text-sm text-neutral-600">No grouped production data.</div>
              ) : (
                <div className="space-y-5">
                  {groupedProduction.map((block) => (
                    <div key={block.windowStart} className="space-y-3">
                      <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">
                        {new Date(block.windowStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} –{' '}
                        {new Date(block.windowEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </div>
                      <GroupedProduction data={[block]} showWindowHeader={false} />
                    </div>
                  ))}
                </div>
              )
            ) : productionOrders.length === 0 ? (
              <div className="text-sm text-neutral-600">No live orders.</div>
            ) : (
              <div className="space-y-4">
                {productionOrders.map((order) => (
                  <div key={order.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-black">Order #{computeDisplayNumber(order)}</div>
                        <p className="break-words text-sm font-semibold text-neutral-800 [overflow-wrap:anywhere]">{order.customerName?.trim() || '—'}</p>
                        <div className="text-xs text-neutral-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="text-xs font-semibold px-3 py-1 rounded-full border border-neutral-200 text-black">
                        {order.status}
                      </div>
                    </div>
                    <div className="mt-3 space-y-3">
                      {order.items.map((item: any, idx: number) => (
                        <div key={idx} className="rounded-2xl border border-neutral-100 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-lg font-bold text-black min-w-0 flex-1">
                              {item.quantity}x {item.menuItem.name}
                            </div>
                            <div className={`text-sm font-bold shrink-0 ${item.status === 'READY' ? 'text-green-600' : 'text-amber-600 animate-pulse'}`}>
                              {item.status === 'READY' ? 'READY' : 'PREPARING'}
                            </div>
                          </div>
                          {formatItemDetails(item, true).length > 0 ? (
                            <div className="mt-2 text-lg text-black font-bold space-y-2">
                              {formatItemDetails(item, true).map((d, j) => (
                                <div key={j} className="bg-neutral-200 px-3 py-2 rounded-lg whitespace-normal break-words leading-tight">{d}</div>
                              ))}
                            </div>
                          ) : null}
                          {item.status !== 'READY' && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await api.post(`/orders/${order.id}/items/${item.id}/mark-ready`);
                                  if (res.data.success) applyOrder(res.data.data);
                                  toast.success(`${item.menuItem.name} marked ready`);
                                } catch (e: any) {
                                  toast.error(e?.response?.data?.error || 'Failed to mark ready');
                                }
                              }}
                              className="mt-3 w-full h-10 rounded-xl bg-neutral-900 text-white text-xs font-bold active:scale-[0.98] transition"
                            >
                              Ready
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    {(order.items?.length ?? 0) > 1 && order.status !== 'READY' && (
                      <button
                        onClick={async () => {
                          try {
                            await markOrderReady(order.id);
                            toast.success('Order items marked ready');
                          } catch (e: any) {
                            toast.error(e?.response?.data?.error || 'Failed to mark ready');
                          }
                        }}
                        className="mt-4 w-full h-12 rounded-2xl bg-black text-white font-semibold active:scale-[0.99] transition"
                      >
                        Ready
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <HistoryOrderList data={historyOrders} />
          )}
        </div>
      </div>
    </>
  );
}
