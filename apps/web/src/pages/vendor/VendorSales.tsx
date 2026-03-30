import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { formatCurrency } from '../../lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';

interface Summary {
  revenue: number;
  orders: number;
  avgOrder: number;
}

interface ProductPerf {
  productName: string;
  qtySold: number;
  revenue: number;
}

interface ProductTrendPoint {
  time: string;
  qty: number;
}
interface ProductTrendSeries {
  productId: string;
  productName: string;
  points: ProductTrendPoint[];
}

interface CompletedOrderItem {
  productName: string;
  qty: number;
  price: number;
}
interface CompletedOrder {
  orderNumber: string;
  totalAmount: number;
  createdAt: string;
  completedAt?: string;
  items: CompletedOrderItem[];
}

export function VendorSales() {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [productTrend, setProductTrend] = useState<ProductTrendSeries[]>([]);
  const [products, setProducts] = useState<ProductPerf[]>([]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);

  const COLORS = ['#ff7f50', '#6495ed', '#ffd700', '#32cd32', '#ff69b4', '#20b2aa'];
  const MOBILE_COLORS = ['#111827', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = { eventId: '', date };
      const [s, pt, p, o] = await Promise.all([
        api.get('/analytics/vendor/summary', { params }),
        api.get('/analytics/vendor/product-trend', { params: { ...params, window: 5, top: 5 } }),
        api.get('/analytics/products', { params }),
        api.get('/analytics/vendor/orders', { params }),
      ]);
      setSummary(s.data.data);
      setProductTrend(pt.data.data || []);
      setProducts(p.data.data);
      setOrders(o.data.data);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const productTrendDataset = useMemo(() => {
    const buckets = new Set<string>();
    for (const series of productTrend) {
      for (const pt of series.points) buckets.add(pt.time);
    }
    const times = Array.from(buckets).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    return times.map((t) => {
      const label = new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const row: Record<string, any> = { time: label };
      for (const series of productTrend) {
        const found = series.points.find((pt) => pt.time === t);
        row[series.productName] = found ? found.qty : 0;
      }
      return row;
    });
  }, [productTrend]);

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden p-6 space-y-6">
        <h1 className="text-2xl font-bold">Vendor Sales Analytics</h1>

        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Button onClick={fetchAll} disabled={loading}>
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-6">
          <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <CardHeader>
              <CardTitle>Revenue</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary?.revenue ?? 0)}</div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.orders ?? 0}</div>
            </CardContent>
          </Card>
          <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <CardHeader>
              <CardTitle>Average Order Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{formatCurrency(summary?.avgOrder ?? 0)}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Product Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80 w-full">
            {productTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">No completed orders for selected date.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productTrendDataset}>
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {productTrend.map((s, idx) => (
                    <Line
                      key={s.productId}
                      type="monotone"
                      dataKey={s.productName}
                      stroke={COLORS[idx % COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent className="h-80 w-full">
            {products.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-gray-500">No product data.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={products}
                    dataKey="qtySold"
                    nameKey="productName"
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    label={false}
                    labelLine={false}
                  >
                    {products.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Product Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {products.length === 0 ? (
              <div className="h-24 flex items-center justify-center text-sm text-gray-500">No product data.</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-2">Product</th>
                    <th className="p-2">Qty</th>
                    <th className="p-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">{p.productName}</td>
                      <td className="p-2">{p.qtySold}</td>
                      <td className="p-2">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Completed Orders</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Order</th>
                  <th className="p-2">Created</th>
                  <th className="p-2">Completed</th>
                  <th className="p-2">Amount</th>
                  <th className="p-2">Items</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-gray-500">No completed orders.</td></tr>
                ) : (
                  orders.map((o, idx) => (
                    <tr key={idx} className="border-b align-top">
                      <td className="p-2">{o.orderNumber}</td>
                      <td className="p-2">{new Date(o.createdAt).toLocaleTimeString()}</td>
                      <td className="p-2">{o.completedAt ? new Date(o.completedAt).toLocaleTimeString() : '-'}</td>
                      <td className="p-2">{formatCurrency(o.totalAmount)}</td>
                      <td className="p-2">
                        <ul>
                          {o.items.map((it, i) => (
                            <li key={i}>
                              {it.qty}x {it.productName} ({formatCurrency(it.price)})
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="hidden [@media(pointer:coarse)]:block min-h-[100dvh] bg-neutral-50 px-4 pt-5 pb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Vendor</div>
            <div className="text-2xl font-semibold text-black">Sales</div>
          </div>
          <button
            onClick={fetchAll}
            disabled={loading}
            className="shrink-0 h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm disabled:opacity-40 active:scale-[0.99] transition"
          >
            Refresh
          </button>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-2" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 [@media(orientation:landscape)]:grid-cols-2">
          <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Revenue</div>
            <div className="mt-2 text-2xl font-semibold text-black">{formatCurrency(summary?.revenue ?? 0)}</div>
          </div>
          <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Orders</div>
            <div className="mt-2 text-2xl font-semibold text-black">{summary?.orders ?? 0}</div>
          </div>
          <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4 [@media(orientation:landscape)]:col-span-2">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Average Order</div>
            <div className="mt-2 text-2xl font-semibold text-black">{formatCurrency(summary?.avgOrder ?? 0)}</div>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Product Trend</div>
          <div className="mt-3 h-64 [@media(orientation:landscape)]:h-52 w-full">
            {productTrend.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-neutral-600">No completed orders for selected date.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={productTrendDataset}>
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  {productTrend.map((s, idx) => (
                    <Line
                      key={s.productId}
                      type="monotone"
                      dataKey={s.productName}
                      stroke={MOBILE_COLORS[idx % MOBILE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Top Products</div>
          <div className="mt-3 h-72 [@media(orientation:landscape)]:h-56 w-full">
            {products.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-neutral-600">No product data.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={products}
                    dataKey="qtySold"
                    nameKey="productName"
                    cx="50%"
                    cy="50%"
                    outerRadius={110}
                    label={false}
                    labelLine={false}
                  >
                    {products.map((_, index) => (
                      <Cell key={`cell-m-${index}`} fill={MOBILE_COLORS[index % MOBILE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Product Breakdown</div>
          <div className="mt-3 space-y-2">
            {products.length === 0 ? (
              <div className="text-sm text-neutral-600">No product data.</div>
            ) : (
              products.map((p, idx) => (
                <div key={idx} className="rounded-2xl border border-neutral-100 p-3">
                  <div className="text-sm font-semibold text-black">{p.productName}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Qty: {p.qtySold} • Revenue: {formatCurrency(p.revenue)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Completed Orders</div>
          <div className="mt-3 space-y-3">
            {orders.length === 0 ? (
              <div className="text-sm text-neutral-600">No completed orders.</div>
            ) : (
              orders.map((o, idx) => (
                <div key={idx} className="rounded-3xl border border-neutral-100 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-black">{o.orderNumber}</div>
                      <div className="text-xs text-neutral-500">
                        Created {new Date(o.createdAt).toLocaleTimeString()}
                        {o.completedAt ? ` • Completed ${new Date(o.completedAt).toLocaleTimeString()}` : ''}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-black">{formatCurrency(o.totalAmount)}</div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {o.items.map((it, i) => (
                      <div key={i} className="text-xs text-neutral-700">
                        {it.qty}x {it.productName} ({formatCurrency(it.price)})
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
