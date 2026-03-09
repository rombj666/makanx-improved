import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { formatCurrency } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { format } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend, BarChart, Bar, PieChart, Pie, Cell } from 'recharts';
import { useNavigate } from 'react-router-dom';

interface EventOption {
  id: string;
  name: string;
}

interface Summary {
  totalRevenue: number;
  totalOrders: number;
  totalVendors: number;
  avgOrder: number;
}

interface TrendPoint {
  hour: number;
  revenue: number;
}

interface VendorAgg {
  vendorId: string;
  vendorName: string;
  orderCount: number;
  revenue: number;
}

interface ProductPerf {
  productName: string;
  totalQty: number;
  totalRevenue: number;
}

export function OrganizerSalesPlaceholder() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventId, setEventId] = useState<string>('');
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [vendors, setVendors] = useState<VendorAgg[]>([]);
  const [products, setProducts] = useState<ProductPerf[]>([]);

  const COLORS = ['#ff7f50', '#6495ed', '#ffd700', '#32cd32', '#ff69b4', '#20b2aa'];

  const loadEvents = async () => {
    try {
      const { data } = await api.get('/events');
      if (data.success) {
        const opts = data.data.map((e: any) => ({ id: e.id, name: e.name }));
        setEvents(opts);
        if (!eventId && opts.length) setEventId(opts[0].id);
      }
    } catch {}
  };

  const fetchAll = async () => {
    if (!eventId) return;
    setLoading(true);
    try {
      const params = { eventId, date };
      const [s, t, v, p] = await Promise.all([
        api.get('/analytics/organizer/summary', { params }),
        api.get('/analytics/organizer/trend', { params }),
        api.get('/analytics/organizer/vendors', { params }),
        api.get('/analytics/organizer/products', { params }),
      ]);
      setSummary(s.data.data);
      setTrend(t.data.data);
      setVendors(v.data.data);
      setProducts(p.data.data);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, date]);

  const trendData = useMemo(
    () => trend.map((d) => ({ name: `${d.hour}:00`, revenue: d.revenue })),
    [trend]
  );
  const vendorBarData = useMemo(
    () => vendors.map((v) => ({ name: v.vendorName, revenue: v.revenue })),
    [vendors]
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 size={24} />
          Organizer Sales Analytics
        </h1>
      </div>

      <div className="flex items-end gap-4">
        <div>
          <label className="text-sm text-gray-600">Event</label>
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="w-64 h-10 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-600">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
        </div>
        <Button onClick={fetchAll} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(summary?.totalRevenue ?? 0)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Total Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalOrders ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Total Vendors</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary?.totalVendors ?? 0}</div>
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
            <LineChart data={trendData}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(val: number | undefined) => formatCurrency(val ?? 0)} />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#ff7f50" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Vendor Revenue</CardTitle>
          </CardHeader>
          <CardContent className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={vendorBarData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(val: number | undefined) => formatCurrency(val ?? 0)} />
                <Legend />
                <Bar dataKey="revenue" fill="#6495ed" />
              </BarChart>
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
                <Pie
                  data={products}
                  dataKey="totalQty"
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
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <CardHeader>
          <CardTitle>Vendor Revenue Table</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="p-2">Vendor</th>
                <th className="p-2">Orders</th>
                <th className="p-2">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr
                  key={v.vendorId}
                  className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/organizer/sales/${v.vendorId}`)}
                >
                  <td className="p-2">{v.vendorName}</td>
                  <td className="p-2">{v.orderCount}</td>
                  <td className="p-2">{formatCurrency(v.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
