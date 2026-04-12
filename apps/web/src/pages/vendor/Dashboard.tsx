import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
import { Card } from '../../components/ui/Card';
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
  displayNumber?: string | number | null;
  status: string;
  totalAmount: string;
  customer?: {
    name?: string;
  } | null;
  items: OrderItem[];
  createdAt: string;
  vendorId: string;
}

export function VendorDashboard() {
  const { socket } = useSocket();
  const [groupByWindow, setGroupByWindow] = useState(false);
  const [groupMinutes, setGroupMinutes] = useState(2);
  const [productionOrders, setProductionOrders] = useState<Order[]>([]);

  // Request deduplication and backoff
  const isFetchingRef = useRef(false);
  const lastFetchRef = useRef(0);
  const [isThrottled, setIsThrottled] = useState(false);

  const [activeTab, setActiveTab] = useState<'kitchen' | 'history'>('kitchen');
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);

  const fetchHistoryOrders = useCallback(async () => {
    try {
      const { data } = await api.get('/orders/vendor-live');
      if (data.success) {
        // In the new flow, orders marked READY are the "finished" ones for the history tab
        const ready = (data.data || []).filter((o: Order) => o.status === 'READY');
        setHistoryOrders(ready);
      }
    } catch (error) {
      console.error('Failed to fetch history orders:', error);
    }
  }, []);

  const fetchProductionBatch = useCallback(async () => {
    if (isFetchingRef.current || isThrottled) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;

    isFetchingRef.current = true;
    lastFetchRef.current = now;
    try {
      const res = await api.get(`/orders/vendor/production-batch?groupByWindow=false`);
      if (res.data.success) {
        setProductionOrders(res.data.data || []);
      }
    } catch (err: any) {
      if (err.response?.status === 429) {
        setIsThrottled(true);
        setTimeout(() => setIsThrottled(false), 30000);
      }
      console.error("Production fetch error:", err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [isThrottled]);

  const refetchAll = useCallback(async () => {
    if (isFetchingRef.current || isThrottled) return;
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;

    isFetchingRef.current = true;
    lastFetchRef.current = now;
    try {
      const [prodRes, liveRes] = await Promise.all([
        api.get(`/orders/vendor/production-batch?groupByWindow=false`),
        api.get('/orders/vendor-live')
      ]);
      if (prodRes.data.success) setProductionOrders(prodRes.data.data || []);
      if (liveRes.data.success) {
        const ready = (liveRes.data.data || []).filter((o: Order) => o.status === 'READY');
        setHistoryOrders(ready);
      }
    } catch (error: any) {
      if (error.response?.status === 429) {
        setIsThrottled(true);
        setTimeout(() => setIsThrottled(false), 30000);
        toast.error('Rate limited. Waiting 30s...');
      }
      console.error('Refetch error:', error);
    } finally {
      isFetchingRef.current = false;
    }
  }, [isThrottled]);

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
    refetchAll();

    if (socket) {
      let t: any;
      const scheduleRefetch = () => {
        clearTimeout(t);
        t = setTimeout(() => {
          void refetchAll();
        }, 1000); // Increased debounce to 1s
      };

      socket.on('connect', scheduleRefetch);

      socket.on('order_created', (newOrder: Order) => {
        // Optimistic update
        setProductionOrders((prev) => {
          if (prev.find(o => o.id === newOrder.id)) return prev;
          return [newOrder, ...prev];
        });
        toast.success('New Order Received!');
        scheduleRefetch();
      });

      socket.on('order_updated', (updatedOrder: Order) => {
        setProductionOrders((prev) => {
          const idx = prev.findIndex((o) => o.id === updatedOrder.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = updatedOrder;
            return next;
          }
          return [updatedOrder, ...prev];
        });
        scheduleRefetch();
      });

      socket.on('vendor_orders_changed', scheduleRefetch);
    }

    return () => {
      if (socket) {
        socket.off('connect');
        socket.off('order_created');
        socket.off('order_updated');
        socket.off('vendor_orders_changed');
      }
    };
  }, [socket, refetchAll]);

  useEffect(() => {
    const onFocus = () => {
      void refetchAll();
    };
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
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible' || isThrottled) return;
      void fetchProductionBatch();
      void fetchHistoryOrders();
    }, 30000); // Slowed to 30s
    return () => clearInterval(poll);
  }, [fetchProductionBatch, fetchHistoryOrders, isThrottled]);

  const markOrderReady = async (id: string) => {
    await api.post(`/orders/${id}/mark-ready`);
    await refetchAll();
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
                          await api.post('/orders/vendor/production/mark-ready', {
                            menuItemId: it.menuItemId,
                            windowStart: windowStartISO,
                            windowEnd: windowEndISO,
                            selectedOptions: it.selectedOptions,
                            remark: it.remark,
                          });
                          toast.success(`${it.name} marked ready`);
                          await refetchAll();
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

  useEffect(() => {
    fetchProductionBatch();
  }, [groupByWindow, fetchProductionBatch]);

  const SingleOrderList = ({ data }: { data: Order[] }) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {data.map((order) => (
        <div key={order.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-6 flex flex-col">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h3 className="text-xl font-bold text-black">Order #{computeDisplayNumber(order)}</h3>
              <p className="text-sm text-neutral-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
            </div>
            <div className="px-3 py-1 rounded-full bg-neutral-100 text-neutral-600 text-xs font-bold uppercase">
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
                  {item.status !== 'READY' ? (
                    <button
                      onClick={async () => {
                        try {
                          await api.post(`/orders/${order.id}/items/${item.id}/mark-ready`);
                          toast.success(`${item.menuItem.name} marked ready`);
                          await refetchAll();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.error || 'Failed to mark ready');
                        }
                      }}
                      className="ml-4 px-3 py-1 bg-neutral-900 text-white text-xs font-bold rounded-lg hover:bg-black transition"
                    >
                      Mark Ready
                    </button>
                  ) : (
                    <span className="ml-4 text-green-600 text-xs font-bold uppercase">Ready</span>
                  )}
                </div>
              </div>
            ))}
          </div>
                  {order.status !== 'READY' && (
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
  );

  const HistoryOrderList = ({ data }: { data: Order[] }) => (
    <div className="space-y-4">
      {data.length === 0 ? (
        <div className="text-sm text-neutral-600">No previous orders.</div>
      ) : (
        data.map((order) => (
          <div key={order.id} className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-black">Order #{computeDisplayNumber(order)}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(order.createdAt).toLocaleTimeString()}
                </div>
              </div>
              <div className="text-xs font-semibold px-3 py-1 rounded-full bg-green-50 text-green-700 border border-green-100">
                READY
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <span className="font-medium text-black">{item.quantity}x {item.menuItem.name}</span>
                  <span className="text-green-600 font-bold text-xs uppercase">Ready</span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {historyOrders.length === 0 ? (
                <div className="text-neutral-600">No ready orders.</div>
              ) : (
                historyOrders.map((order) => (
                  <Card key={order.id} className="p-4 border border-neutral-100 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h5 className="font-bold">Order #{computeDisplayNumber(order)}</h5>
                        <p className="text-xs text-neutral-500">{new Date(order.createdAt).toLocaleTimeString()}</p>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-100 uppercase">
                        READY
                      </span>
                    </div>
                    <div className="space-y-2">
                      {order.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{item.quantity}x {item.menuItem.name}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))
              )}
            </div>
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
                      <div>
                        <div className="text-sm font-semibold text-black">Order #{computeDisplayNumber(order)}</div>
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
                                  await api.post(`/orders/${order.id}/items/${item.id}/mark-ready`);
                                  toast.success(`${item.menuItem.name} marked ready`);
                                  await refetchAll();
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
                    {order.status !== 'READY' && (
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
