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

interface TrendPoint {
  hour: number;
  revenue: number;
}

interface ProductPerf {
  productName: string;
  qtySold: number;
  revenue: number;
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
  items: CompletedOrderItem[];
}

export function VendorSales() {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [products, setProducts] = useState<ProductPerf[]>([]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);

  const COLORS = ['#ff7f50', '#6495ed', '#ffd700', '#32cd32', '#ff69b4', '#20b2aa'];

  const fetchAll = async () => {
    setLoading(true);
    try {
      const params = { date };
      const [s, t, p, o] = await Promise.all([
        api.get('/analytics/vendor/summary', { params }),
        api.get('/analytics/vendor/trend', { params }),
        api.get('/analytics/vendor/products', { params }),
        api.get('/analytics/vendor/orders', { params }),
      ]);
      setSummary(s.data.data);
      setTrend(t.data.data);
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

  const formattedTrend = useMemo(
    () => trend.map((d) => ({ name: `${d.hour}:00`, revenue: d.revenue })),
    [trend]
  );

  return (
    <div className="p-6 space-y-6">
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
          <CardTitle>Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedTrend}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(val: number | undefined) => formatCurrency(val ?? 0)} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#ff7f50" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
        </CardHeader>
        <CardContent className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={products} dataKey="qtySold" nameKey="productName" outerRadius={120} label>
                {products.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <CardHeader>
          <CardTitle>Product Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
                <th className="p-2">Amount</th>
                <th className="p-2">Time</th>
                <th className="p-2">Items</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, idx) => (
                <tr key={idx} className="border-b align-top">
                  <td className="p-2">#{o.orderNumber}</td>
                  <td className="p-2">{formatCurrency(o.totalAmount)}</td>
                  <td className="p-2">{new Date(o.createdAt).toLocaleTimeString()}</td>
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
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
