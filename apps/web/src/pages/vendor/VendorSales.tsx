import { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { saveAs } from 'file-saver';
import { useAuth } from '../../context/AuthContext';
import { Mail, Plus, X } from 'lucide-react';

interface Summary {
  orders: number;
  revenue: number;
}

interface ProductPerf {
  productName: string;
  qtySold: number;
  revenue: number;
  optionBreakdown: Record<string, number>;
  remarks: string[];
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
  remark?: string;
  selectedOptions?: any;
}

interface VendorSettings {
  dailyDrinkLimitEnabled: boolean;
  dailyDrinkLimitQuantity: number;
  autoStopOrderingOnLimit: boolean;
  reportRecipientEmail: string | null;
  reportRecipientEmails: string[];
}

interface OrderLimitSettings {
  deviceOrderLimitEnabled: boolean;
  maxDrinksPerOrder: number;
}

interface DailyUsage {
  usedQuantity: number;
  dailyLimit: number;
  orderingClosed: boolean;
}
interface CompletedOrder {
  orderNumber: string;
  createdAt: string;
  completedAt?: string;
  totalAmount: number;
  items: CompletedOrderItem[];
}

export function VendorSales() {
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [productTrend, setProductTrend] = useState<ProductTrendSeries[]>([]);
  const [products, setProducts] = useState<ProductPerf[]>([]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [settings, setSettings] = useState<VendorSettings | null>(null);
  const [orderLimitSettings, setOrderLimitSettings] = useState<OrderLimitSettings | null>(null);
  const [usage, setUsage] = useState<DailyUsage | null>(null);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [updatingOrderLimit, setUpdatingOrderLimit] = useState(false);
  const [resettingEventOrders, setResettingEventOrders] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');

  const trendChartRef = useRef<HTMLDivElement>(null);
  const topProductsChartRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

  const COLORS = ['#ff7f50', '#6495ed', '#ffd700', '#32cd32', '#ff69b4', '#20b2aa'];
  const MOBILE_COLORS = ['#111827', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

  const fetchAll = async (targetDate = date) => {
    setLoading(true);
    try {
      const params = { eventId: '', date: targetDate };
      const [s, pt, p, o, sett, orderLimit, usg] = await Promise.all([
        api.get('/analytics/vendor/summary', { params }),
        api.get('/analytics/vendor/product-trend', { params: { ...params, window: 5, top: 5 } }),
        api.get('/analytics/products', { params }),
        api.get('/analytics/vendor/orders', { params }),
        api.get('/vendor/settings'),
        api.get('/vendor/order-limit-settings'),
        api.get('/vendor/daily-usage'),
      ]);
      setSummary(s.data.data);
      setProductTrend(pt.data.data || []);
      setProducts(p.data.data);
      setOrders(o.data.data);
      setSettings(sett.data.data);
      setOrderLimitSettings(orderLimit.data.data);
      setUsage(usg.data.data);
    } catch (e) {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSettings = async (updates: Partial<VendorSettings>) => {
    setUpdatingSettings(true);
    try {
      if (updates.reportRecipientEmails) {
        console.log("Saving reportRecipientEmails", updates.reportRecipientEmails);
        // Ensure backward compatibility: send the first email as reportRecipientEmail too
        updates.reportRecipientEmail = updates.reportRecipientEmails[0] ?? "";
      }
      const res = await api.patch('/vendor/settings', updates);
      setSettings(res.data.data);
      toast.success('Settings updated');
      fetchAll(); // Refresh usage to see updated limit
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update settings');
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleUpdateOrderLimitSettings = async (updates: Partial<OrderLimitSettings>) => {
    const next = {
      deviceOrderLimitEnabled: orderLimitSettings?.deviceOrderLimitEnabled ?? false,
      maxDrinksPerOrder: orderLimitSettings?.maxDrinksPerOrder ?? 1,
      ...updates,
    };
    next.maxDrinksPerOrder = Math.max(1, Math.floor(Number(next.maxDrinksPerOrder) || 1));

    setUpdatingOrderLimit(true);
    try {
      const res = await api.patch('/vendor/order-limit-settings', next);
      setOrderLimitSettings(res.data.data);
      toast.success('Order limit settings updated');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update order limit settings');
    } finally {
      setUpdatingOrderLimit(false);
    }
  };

  const handleToggleOrdering = async (closed: boolean) => {
    try {
      const res = await api.post('/vendor/toggle-ordering', { closed });
      setUsage(res.data.data);
      toast.success(closed ? 'Ordering closed' : 'Ordering opened');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update status');
    }
  };

  const handleAddEmail = () => {
    if (!newEmail) return;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      toast.error('Invalid email format');
      return;
    }
    
    const currentEmails = settings?.reportRecipientEmails || [];
    if (currentEmails.includes(newEmail.toLowerCase())) {
      toast.error('Email already added');
      return;
    }
    
    const updatedEmails = [...currentEmails, newEmail.toLowerCase()];
    handleUpdateSettings({ reportRecipientEmails: updatedEmails });
    setNewEmail('');
  };

  const handleRemoveEmail = (emailToRemove: string) => {
    const updatedEmails = (settings?.reportRecipientEmails || []).filter(e => e !== emailToRemove);
    handleUpdateSettings({ reportRecipientEmails: updatedEmails });
  };

  const handleExport = async () => {
    if (orders.length === 0) {
      toast.error('No orders to export');
      return;
    }

    const toastId = toast.loading('Generating professional report...');
    try {
      const response = await api.get('/analytics/vendor/export', {
        params: { date },
        responseType: 'blob'
      });
      
      const fileName = `vendor-sales-report-${user?.vendorProfile?.businessName?.toLowerCase().replace(/\s+/g, '-') || 'report'}-${date}.xlsx`;
      saveAs(response.data, fileName);
      toast.success('Report generated', { id: toastId });
    } catch (e: any) {
      toast.error('Failed to generate report', { id: toastId });
    }
  };

  const handleResetEventOrders = async () => {
    const toastId = toast.loading('Resetting event orders...');
    setResettingEventOrders(true);
    try {
      await api.post('/vendor/sales/reset-event');
      toast.success('Event orders reset successfully', { id: toastId });
      const today = format(new Date(), 'yyyy-MM-dd');
      setDate(today);
      await fetchAll(today);
      setResetConfirmOpen(false);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to reset event orders', { id: toastId });
    } finally {
      setResettingEventOrders(false);
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
      const label = format(new Date(t), 'HH:mm');
      const row: Record<string, any> = { time: label };
      for (const series of productTrend) {
        const found = series.points.find((pt) => pt.time === t);
        row[series.productName] = found ? found.qty : 0;
      }
      return row;
    });
  }, [productTrend]);

  const productTotals = useMemo(() => {
    return products.reduce(
      (acc, p) => ({
        qty: acc.qty + p.qtySold,
      }),
      { qty: 0 }
    );
  }, [products]);

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden p-6 space-y-6">
        <h1 className="text-2xl font-bold">Vendor Sales Analytics</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white rounded-xl shadow-sm border border-gray-100">
            <CardHeader>
              <CardTitle>Daily Drink Production Limit</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Enable Limit</span>
                <Button 
                  size="sm" 
                  variant={settings?.dailyDrinkLimitEnabled ? "default" : "outline"}
                  onClick={() => handleUpdateSettings({ dailyDrinkLimitEnabled: !settings?.dailyDrinkLimitEnabled })}
                  disabled={updatingSettings}
                >
                  {settings?.dailyDrinkLimitEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              
              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <label className="text-sm text-gray-600">Daily Quantity Limit</label>
                  <div className="flex gap-2">
                    <Input 
                      type="number" 
                      defaultValue={settings?.dailyDrinkLimitQuantity}
                      onBlur={(e) => handleUpdateSettings({ dailyDrinkLimitQuantity: parseInt(e.target.value) })}
                      className="w-32"
                    />
                    <span className="text-sm self-center text-gray-500">drinks / day</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Auto-Stop Ordering on Limit</span>
                <Button 
                  size="sm" 
                  variant={settings?.autoStopOrderingOnLimit ? "default" : "outline"}
                  onClick={() => handleUpdateSettings({ autoStopOrderingOnLimit: !settings?.autoStopOrderingOnLimit })}
                  disabled={updatingSettings}
                >
                  {settings?.autoStopOrderingOnLimit ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-600">Report Recipients</label>
                <div className="flex gap-2">
                  <Input 
                    type="email" 
                    placeholder="Enter report email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    className="flex-1"
                  />
                  <Button size="sm" onClick={handleAddEmail} type="button">
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
                
                <div className="flex flex-wrap gap-2 mt-2">
                  {(settings?.reportRecipientEmails || []).length === 0 && (
                    <div className="text-xs text-gray-400 italic">No emails added</div>
                  )}
                  {(settings?.reportRecipientEmails || []).map((email) => (
                    <div 
                      key={email} 
                      className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded-full text-xs text-gray-700 border border-gray-200"
                    >
                      <Mail className="w-3 h-3" />
                      {email}
                      <button 
                        onClick={() => handleRemoveEmail(email)}
                        className="ml-1 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-100">
            <CardHeader>
              <CardTitle>ORDER LIMIT CONTROL</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">Enable Device Limit</span>
                <Button
                  size="sm"
                  variant={orderLimitSettings?.deviceOrderLimitEnabled ? "default" : "outline"}
                  onClick={() => handleUpdateOrderLimitSettings({ deviceOrderLimitEnabled: !orderLimitSettings?.deviceOrderLimitEnabled })}
                  disabled={updatingOrderLimit}
                >
                  {orderLimitSettings?.deviceOrderLimitEnabled ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-sm text-gray-600">Max Drinks Per Order</label>
                <div className="flex items-center gap-2">
                  <Input
                    key={`desktop-order-limit-${orderLimitSettings?.maxDrinksPerOrder ?? 1}`}
                    type="number"
                    min={1}
                    defaultValue={orderLimitSettings?.maxDrinksPerOrder ?? 1}
                    onBlur={(e) => handleUpdateOrderLimitSettings({ maxDrinksPerOrder: parseInt(e.target.value, 10) })}
                    className="w-24"
                  />
                  <span className="text-sm text-gray-500">drinks / order</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white rounded-xl shadow-sm border border-gray-100">
            <CardHeader>
              <CardTitle>Ordering Status & Usage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-gray-500">Current Status</div>
                  <div className={`text-lg font-bold ${usage?.orderingClosed ? 'text-red-600' : 'text-green-600'}`}>
                    {usage?.orderingClosed ? 'ORDERING CLOSED' : 'ORDERING OPEN'}
                  </div>
                </div>
                <Button 
                  variant={usage?.orderingClosed ? "default" : "destructive"}
                  onClick={() => handleToggleOrdering(!usage?.orderingClosed)}
                >
                  {usage?.orderingClosed ? 'Open Ordering' : 'Close Ordering'}
                </Button>
              </div>

              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Daily Usage</span>
                    <span className="font-bold">{usage?.usedQuantity || 0} / {usage?.dailyLimit || settings?.dailyDrinkLimitQuantity} drinks</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) >= 1 ? 'bg-red-600' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, ((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Button onClick={() => fetchAll()} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            Export
          </Button>
          <Button variant="destructive" onClick={() => setResetConfirmOpen(true)} disabled={loading || resettingEventOrders}>
            Reset Event Orders
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
            <CardHeader>
              <CardTitle>Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{summary?.orders ?? 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Product Trend</CardTitle>
          </CardHeader>
          <CardContent className="h-80 w-full" ref={trendChartRef}>
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
          <CardContent className="h-80 w-full" ref={topProductsChartRef}>
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
                    <th className="p-2 text-right">Qty Sold</th>
                    <th className="p-2 text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">
                        <div className="font-medium">{p.productName}</div>
                        {Object.entries(p.optionBreakdown).map(([opt, qty]) => (
                          <div key={opt} className="text-xs text-gray-500 pl-2">
                            • {opt}: {qty}
                          </div>
                        ))}
                        {p.remarks.length > 0 && (
                          <div className="text-xs text-orange-600 pl-2 mt-1 italic">
                            Remarks: {p.remarks.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="p-2 text-right">{p.qtySold}</td>
                      <td className="p-2 text-right">RM {p.revenue.toFixed(2)}</td>
                    </tr>
                  ))}
                  {products.length > 0 && (
                    <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                      <td className="p-2">Total</td>
                      <td className="p-2 text-right">{productTotals.qty}</td>
                      <td className="p-2 text-right">RM {products.reduce((s, p) => s + p.revenue, 0).toFixed(2)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <CardHeader>
            <CardTitle>Detailed Orders</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2">Order</th>
                  <th className="p-2">Created</th>
                  <th className="p-2">Items</th>
                  <th className="p-2">Remarks</th>
                  <th className="p-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={5} className="p-6 text-center text-sm text-gray-500">No orders for this date.</td></tr>
                ) : (
                  orders.map((o, idx) => (
                    <tr key={idx} className="border-b align-top">
                      <td className="p-2 font-medium">{o.orderNumber}</td>
                      <td className="p-2 text-gray-500">{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-2">
                        <ul>
                          {o.items.map((it, i) => (
                            <li key={i} className="mb-1">
                              <span className="font-medium">{it.qty}x</span> {it.productName}
                              {it.selectedOptions && (
                                <div className="text-xs text-gray-400">
                                  {it.selectedOptions.map((g: any) => g.choices.map((c: any) => c.label).join(', ')).join(' | ')}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-2 text-orange-600 italic">
                        {o.items.map((it, i) => it.remark ? <div key={i}>• {it.remark}</div> : null)}
                      </td>
                      <td className="p-2 text-right font-medium">RM {o.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <div className="hidden [@media(pointer:coarse)]:block min-h-[100dvh] w-full max-w-full bg-neutral-50 px-3 pt-5 pb-6 sm:px-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Vendor</div>
            <div className="text-2xl font-semibold text-black">Sales</div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <Card className="w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Daily Drink Production Limit</div>
            <div className="mt-3 space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">Enable Limit</span>
                <Button 
                  size="sm" 
                  variant={settings?.dailyDrinkLimitEnabled ? "default" : "outline"}
                  onClick={() => handleUpdateSettings({ dailyDrinkLimitEnabled: !settings?.dailyDrinkLimitEnabled })}
                  disabled={updatingSettings}
                  className="shrink-0"
                >
                  {settings?.dailyDrinkLimitEnabled ? "Enabled" : "Disabled"}
                </Button>
              </div>
              
              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <label className="text-xs text-neutral-500">Limit Quantity</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <Input 
                      type="number" 
                      defaultValue={settings?.dailyDrinkLimitQuantity}
                      onBlur={(e) => handleUpdateSettings({ dailyDrinkLimitQuantity: parseInt(e.target.value) })}
                      className="w-24 min-w-0"
                    />
                    <span className="min-w-0 text-xs text-neutral-500">drinks / day</span>
                  </div>
                </div>
              )}

              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">Auto-Stop</span>
                <Button 
                  size="sm" 
                  variant={settings?.autoStopOrderingOnLimit ? "default" : "outline"}
                  onClick={() => handleUpdateSettings({ autoStopOrderingOnLimit: !settings?.autoStopOrderingOnLimit })}
                  disabled={updatingSettings}
                  className="shrink-0"
                >
                  {settings?.autoStopOrderingOnLimit ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-neutral-500">Report Recipients</div>
                <div className="flex min-w-0 gap-2">
                  <Input 
                    type="email" 
                    placeholder="Enter report email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddEmail()}
                    className="min-w-0 flex-1"
                  />
                  <Button size="sm" onClick={handleAddEmail} type="button" className="shrink-0">
                    <Plus className="w-4 h-4 mr-1" /> Add
                  </Button>
                </div>
                
                <div className="flex min-w-0 flex-wrap gap-2 mt-2">
                  {(settings?.reportRecipientEmails || []).length === 0 && (
                    <div className="text-xs text-neutral-400 italic">No emails added</div>
                  )}
                  {(settings?.reportRecipientEmails || []).map((email) => (
                    <div 
                      key={email} 
                      className="flex max-w-full min-w-0 items-center gap-1 bg-neutral-100 px-2 py-1 rounded-full text-xs text-neutral-700 border border-neutral-200"
                    >
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 truncate">{email}</span>
                      <button 
                        onClick={() => handleRemoveEmail(email)}
                        className="ml-1 shrink-0 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">ORDER LIMIT CONTROL</div>
            <div className="mt-3 space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">Enable Device Limit</span>
                <Button
                  size="sm"
                  variant={orderLimitSettings?.deviceOrderLimitEnabled ? "default" : "outline"}
                  onClick={() => handleUpdateOrderLimitSettings({ deviceOrderLimitEnabled: !orderLimitSettings?.deviceOrderLimitEnabled })}
                  disabled={updatingOrderLimit}
                  className="shrink-0"
                >
                  {orderLimitSettings?.deviceOrderLimitEnabled ? "ON" : "OFF"}
                </Button>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-neutral-500">Max Drinks Per Order</label>
                <div className="flex min-w-0 items-center gap-2">
                  <Input
                    key={`mobile-order-limit-${orderLimitSettings?.maxDrinksPerOrder ?? 1}`}
                    type="number"
                    min={1}
                    defaultValue={orderLimitSettings?.maxDrinksPerOrder ?? 1}
                    onBlur={(e) => handleUpdateOrderLimitSettings({ maxDrinksPerOrder: parseInt(e.target.value, 10) })}
                    className="w-20 min-w-0"
                  />
                  <span className="min-w-0 text-xs text-neutral-500">drinks / order</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Ordering Status & Usage</div>
            <div className="mt-3 space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <div className={`min-w-0 text-sm font-bold ${usage?.orderingClosed ? 'text-red-600' : 'text-green-600'}`}>
                  {usage?.orderingClosed ? 'ORDERING CLOSED' : 'ORDERING OPEN'}
                </div>
                <Button 
                  size="sm"
                  variant={usage?.orderingClosed ? "default" : "destructive"}
                  onClick={() => handleToggleOrdering(!usage?.orderingClosed)}
                  className="shrink-0"
                >
                  {usage?.orderingClosed ? 'Open' : 'Close'}
                </Button>
              </div>

              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <div className="flex min-w-0 justify-between gap-3 text-xs">
                    <span className="text-neutral-500">Daily Usage</span>
                    <span className="min-w-0 text-right font-bold">{usage?.usedQuantity || 0} / {usage?.dailyLimit || settings?.dailyDrinkLimitQuantity} drinks</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) >= 1 ? 'bg-red-600' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, ((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

            </div>
          </Card>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-2" />
          <div className="mt-4 grid w-full min-w-0 grid-cols-2 gap-2">
            <button
              onClick={() => fetchAll()}
              disabled={loading}
              className="h-11 min-w-0 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-black transition active:scale-[0.99] disabled:opacity-40"
            >
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={loading}
              className="h-11 min-w-0 rounded-2xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-black transition active:scale-[0.99] disabled:opacity-40"
            >
              Export
            </button>
            <button
              onClick={() => setResetConfirmOpen(true)}
              disabled={loading || resettingEventOrders}
              className="col-span-2 h-11 min-w-0 rounded-2xl border border-red-700 bg-red-600 px-3 text-sm font-semibold text-white transition active:scale-[0.99] disabled:opacity-40"
            >
              Reset Event Orders
            </button>
          </div>
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3">
          <div className="min-w-0 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Orders</div>
            <div className="mt-2 text-2xl font-semibold text-black">{summary?.orders ?? 0}</div>
          </div>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Product Trend</div>
          <div className="mt-3 h-64 w-full min-w-0 [@media(orientation:landscape)]:h-52">
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

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Top Products</div>
          <div className="mt-3 h-72 w-full min-w-0 [@media(orientation:landscape)]:h-56">
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

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Product Breakdown</div>
          <div className="mt-3 space-y-2">
            {products.length === 0 ? (
              <div className="text-sm text-neutral-600">No product data.</div>
            ) : (
              products.map((p, idx) => (
                <div key={idx} className="min-w-0 rounded-2xl border border-neutral-100 p-3">
                  <div className="break-words text-sm font-semibold text-black">{p.productName}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Qty: {p.qtySold}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Completed Orders</div>
          <div className="mt-3 space-y-3">
            {orders.length === 0 ? (
              <div className="text-sm text-neutral-600">No completed orders.</div>
            ) : (
              orders.map((o, idx) => (
                <div key={idx} className="min-w-0 rounded-3xl border border-neutral-100 p-4">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="break-words text-sm font-semibold text-black">{o.orderNumber}</div>
                      <div className="text-xs text-neutral-500">
                        Created {format(new Date(o.createdAt), 'HH:mm')}
                        {o.completedAt ? ` • Completed ${format(new Date(o.completedAt), 'HH:mm')}` : ''}     
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1">
                    {o.items.map((it, i) => (
                      <div key={i} className="break-words text-xs text-neutral-700">
                        {it.qty}x {it.productName}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Modal
        isOpen={resetConfirmOpen}
        onClose={() => {
          if (!resettingEventOrders) setResetConfirmOpen(false);
        }}
        title="Reset Event Orders"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-gray-700">
            Are you sure you want to reset this event's orders? This will delete all order records and order items for the current event, clear sales analytics, ready orders, and kitchen view for this event, and reset today's usage back to 0. The daily quantity limit will stay unchanged. This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
              disabled={resettingEventOrders}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleResetEventOrders}
              disabled={resettingEventOrders}
              isLoading={resettingEventOrders}
            >
              Confirm Reset
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
