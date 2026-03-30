import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useSocket } from '../../context/SocketContext';
import { Card, CardContent } from '../../components/ui/Card';
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

const COLUMNS = ['PREPARING', 'READY', 'COMPLETED'] as const;
type Column = (typeof COLUMNS)[number];

export function VendorDashboard() {
  const { socket } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [viewMode, setViewMode] = useState<'kitchen' | 'fulfillment'>('kitchen');
  const [groupByWindow, setGroupByWindow] = useState(false);
  const [groupMinutes, setGroupMinutes] = useState(2);
  const [productionOrders, setProductionOrders] = useState<Order[]>([]);

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
        }, 200);
      };

      socket.on('connect', scheduleRefetch);

      socket.on('order_created', (newOrder: Order) => {
        setOrders((prev) => [newOrder, ...prev]);
        toast.success('New Order Received!');
        scheduleRefetch();
      });

      socket.on('order_updated', (updatedOrder: Order) => {
        setOrders((prev) => {
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
  }, [socket]);

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
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void fetchOrders();
      if (viewMode === 'kitchen') void fetchProductionBatch();
    }, 5000);
    return () => clearInterval(poll);
  }, [viewMode]);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get('/orders/vendor-live');
      if (data.success) {
        const list: Order[] = data.data || [];
        setOrders(list);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const getOrdersByStatus = (status: string) => {
    return orders.filter(o => o.status === status);
  };

  const fetchProductionBatch = async () => {
    try {
      const res = await api.get(`/orders/vendor/production-batch?groupByWindow=false`);
      if (res.data.success) {
        setProductionOrders(res.data.data);
      }
    } catch (err) {
      console.error("Production fetch error:", err);
    }
  };
  const refetchAll = async () => {
    await Promise.all([fetchOrders(), fetchProductionBatch()]);
  };
  const markComplete = async (id: string) => {
    const snapshot = orders.find((o) => o.id === id);
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: 'COMPLETED' } : o)));
    try {
      await api.patch(`/orders/${id}/status`, { status: 'COMPLETED' });
      toast.success('Order completed');
    } catch (e: any) {
      if (snapshot) {
        setOrders((prev) => prev.map((o) => (o.id === id ? snapshot : o)));
      }
      toast.error(e?.response?.data?.error || 'Failed to complete order');
    } finally {
      await refetchAll();
    }
  };
  const markOrderReady = async (id: string) => {
    await api.post(`/orders/${id}/items/mark-ready`);
    await refetchAll();
  };

  const formatItemDetails = (it: OrderItem) => {
    const parts: string[] = [];
    const opts = Array.isArray(it.selectedOptions) ? it.selectedOptions : [];
    for (const s of opts) {
      const title = String(s?.title || '');
      const choices = Array.isArray(s?.choices) ? s.choices : [];
      const labels = choices.map((c: any) => String(c?.label || '')).filter(Boolean);
      if (!title || labels.length === 0) continue;
      parts.push(`${title}: ${labels.join(', ')}`);
    }
    const remark = String(it.remark || '').trim();
    if (remark) parts.push(`Note: ${remark}`);
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
                        <span className="font-medium">{it.name}</span>{' '}
                        <span className="font-semibold">x{it.quantity}</span>
                      </div>
                      {it.details.length > 0 ? (
                        <div className="mt-1 text-xs text-gray-600 space-y-1">
                          {it.details.map((d, idx) => (
                            <div key={idx} className="truncate">
                              {d}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Button
                      className="bg-green-600 text-white"
                      onClick={async () => {
                        try {
                          await api.post('/orders/vendor/production/mark-ready', {
                            menuItemId: it.menuItemId,
                            windowStart: windowStartISO,
                            windowEnd: windowEndISO,
                            selectedOptions: it.selectedOptions,
                            remark: it.remark,
                          });
                          toast.success(`${it.name} marked ready for this window`);
                          await refetchAll();
                        } catch (e: any) {
                          toast.error(e?.response?.data?.error || 'Failed to mark ready');
                        }
                      }}
                    >
                      Mark Ready
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

  const FulfillmentBoardView = ({
    orders,
    COLUMNS,
    getOrdersByStatus,
  }: {
    orders: Order[];
    COLUMNS: readonly Column[];
    getOrdersByStatus: (status: string) => Order[];
  }) => {
    void orders;
    return (
      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 h-full min-w-[1000px]">
          {COLUMNS.map((status) => (
            <div key={status} className="flex-1 bg-gray-50 rounded-lg p-4 flex flex-col">
              <h3 className="font-bold text-lg mb-4 text-center sticky top-0 bg-gray-50 pb-2 border-b">
                {status} ({getOrdersByStatus(status).length})
              </h3>
              <div className="flex-1 overflow-y-auto space-y-4">
                {getOrdersByStatus(status).map((order) => (
                  <Card key={order.id} className="cursor-pointer hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold">#{computeDisplayNumber(order)}</span>
                        <span className="text-xs text-gray-500">
                          {new Date(order.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="text-sm font-medium mb-2">{order.customer?.name ?? 'Guest'}</p>
                      <ul className="text-sm space-y-1 mb-3">
                        {order.items.map((item, idx) => (
                          <li key={idx} className="py-1">
                            <div className="flex justify-between">
                              <span>
                                {item.quantity}x {item.menuItem.name}
                              </span>
                              <span className="text-xs">
                                {item.status === 'READY' ? '✓ Ready' : 'Preparing'}
                              </span>
                            </div>
                            {formatItemDetails(item).length > 0 ? (
                              <div className="mt-1 text-xs text-gray-600 space-y-1">
                                {formatItemDetails(item).map((d, j) => (
                                  <div key={j}>{d}</div>
                                ))}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <Button
                          onClick={() => markComplete(order.id)}
                          disabled={
                            order.status === 'COMPLETED' ||
                            !order.items ||
                            !order.items.every((it: any) => it.status === 'READY')
                          }
                          className="bg-blue-500 text-white px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                          title={
                            order.status === 'COMPLETED'
                              ? 'Completed'
                              : !order.items || !order.items.every((it: any) => it.status === 'READY')
                                ? 'Waiting for remaining items'
                                : 'Hand to Customer'
                          }
                        >
                          {order.status === 'COMPLETED' ? 'Completed' : 'Complete'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  useEffect(() => {
    fetchProductionBatch();
  }, [groupByWindow]);

  const SingleOrderList = ({ data }: { data: Order[] }) => (
    <>
      {data.map((order) => (
        <Card key={order.id} className="p-4 mb-2">
          <div className="flex justify-between items-start">
            <div>
              <h5 className="font-semibold">Order #{computeDisplayNumber(order)}</h5>
              <p className="text-sm text-gray-600">{new Date(order.createdAt).toLocaleTimeString()}</p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              order.status === 'PREPARING' ? 'bg-yellow-100 text-yellow-800' :
              order.status === 'READY' ? 'bg-green-100 text-green-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {order.status}
            </span>
          </div>
          <div className="mt-2">
            {order.items.map((item: any, idx: number) => (
              <div key={idx} className="text-sm py-1">
                <div className="flex justify-between items-center">
                  <span>
                    {item.quantity}x {item.menuItem.name}
                  </span>
                  <span className="text-xs">
                    {item.status === 'READY' ? '✓ Ready' : 'Preparing'}
                  </span>
                </div>
                {formatItemDetails(item).length > 0 ? (
                  <div className="mt-1 text-xs text-gray-600 space-y-1">
                    {formatItemDetails(item).map((d, j) => (
                      <div key={j}>{d}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          {order.status !== 'COMPLETED' && (
            <div className="mt-3">
              <Button
                onClick={async () => {
                  try {
                    await markOrderReady(order.id);
                    toast.success('Order items marked ready');
                  } catch (e: any) {
                    toast.error(e?.response?.data?.error || 'Failed to mark ready');
                  }
                }}
                className="bg-green-600 text-white px-3 py-1 rounded"
              >
                Mark Ready
              </Button>
            </div>
          )}
        </Card>
      ))}
    </>
  );

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden container mx-auto p-6 h-[calc(100vh-64px)] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Live Orders</h1>
          <div className="flex items-center gap-3">
            <div className="inline-flex rounded-md border bg-white overflow-hidden">
              <Button
                variant={viewMode === 'kitchen' ? 'default' : 'outline'}
                className={viewMode === 'kitchen' ? 'bg-orange-500 text-white' : 'bg-white'}
                onClick={() => setViewMode('kitchen')}
              >
                Kitchen View
              </Button>
              <Button
                variant={viewMode === 'fulfillment' ? 'default' : 'outline'}
                className={viewMode === 'fulfillment' ? 'bg-gray-200' : 'bg-white'}
                onClick={() => setViewMode('fulfillment')}
              >
                Order Fulfillment
              </Button>
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
                fetchOrders();
                fetchProductionBatch();
              }}
            >
              Refresh
            </Button>
          </div>
        </div>
        {viewMode === 'kitchen' && (
          <div className="mt-4">
            {groupByWindow && groupedProduction.length === 0 && <p>No grouped production data.</p>}
            {!groupByWindow && productionOrders.length === 0 && <p>No live orders.</p>}
            {groupByWindow && <GroupedProduction data={groupedProduction} />}
            {!groupByWindow && <SingleOrderList data={productionOrders} />}
          </div>
        )}

        {viewMode === 'fulfillment' && (
          <FulfillmentBoardView orders={orders} COLUMNS={COLUMNS} getOrdersByStatus={getOrdersByStatus} />
        )}
      </div>

      <div className="hidden [@media(pointer:coarse)]:flex flex-col min-h-[100dvh] bg-neutral-50 px-4 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Vendor</div>
            <div className="text-2xl font-semibold text-black">Live Orders</div>
          </div>
          <button
            onClick={() => {
              fetchOrders();
              fetchProductionBatch();
            }}
            className="shrink-0 h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm active:scale-[0.99] transition"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 inline-flex rounded-2xl border border-neutral-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setViewMode('kitchen')}
            className={`h-11 px-4 text-sm font-semibold ${
              viewMode === 'kitchen' ? 'bg-black text-white' : 'bg-white text-black'
            }`}
          >
            Kitchen
          </button>
          <button
            type="button"
            onClick={() => setViewMode('fulfillment')}
            className={`h-11 px-4 text-sm font-semibold ${
              viewMode === 'fulfillment' ? 'bg-black text-white' : 'bg-white text-black'
            }`}
          >
            Fulfillment
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
          {viewMode === 'kitchen' ? (
            <>
              {groupByWindow ? (
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
                              <div className="text-sm font-semibold text-black">
                                {item.quantity}x {item.menuItem.name}
                              </div>
                              <div className="text-xs text-neutral-600">
                                {item.status === 'READY' ? '✓ Ready' : 'Preparing'}
                              </div>
                            </div>
                            {formatItemDetails(item).length > 0 ? (
                              <div className="mt-2 text-xs text-neutral-600 space-y-1">
                                {formatItemDetails(item).map((d, j) => (
                                  <div key={j}>{d}</div>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {order.status !== 'COMPLETED' ? (
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
                          Mark Ready
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-5">
              {COLUMNS.map((status) => {
                const list = getOrdersByStatus(status);
                return (
                  <div key={status}>
                    <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase mb-2">
                      {status} ({list.length})
                    </div>
                    <div className="space-y-3">
                      {list.length === 0 ? (
                        <div className="text-sm text-neutral-600">No orders.</div>
                      ) : (
                        list.map((order) => (
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
                                    <div className="text-sm font-semibold text-black">
                                      {item.quantity}x {item.menuItem.name}
                                    </div>
                                    <div className="text-xs text-neutral-600">
                                      {item.status === 'READY' ? '✓ Ready' : 'Preparing'}
                                    </div>
                                  </div>
                                  {formatItemDetails(item).length > 0 ? (
                                    <div className="mt-2 text-xs text-neutral-600 space-y-1">
                                      {formatItemDetails(item).map((d, j) => (
                                        <div key={j}>{d}</div>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            <button
                              onClick={() => markComplete(order.id)}
                              disabled={
                                order.status === 'COMPLETED' ||
                                !order.items ||
                                !order.items.every((it: any) => it.status === 'READY')
                              }
                              className="mt-4 w-full h-12 rounded-2xl bg-black text-white font-semibold disabled:opacity-40 active:scale-[0.99] transition"
                            >
                              {order.status === 'COMPLETED' ? 'Completed' : 'Complete'}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
