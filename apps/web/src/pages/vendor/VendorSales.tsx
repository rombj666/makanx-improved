import { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Mail, Plus, X } from 'lucide-react';

interface Summary {
  orders: number;
}

interface ProductPerf {
  productName: string;
  qtySold: number;
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
  items: CompletedOrderItem[];
}

function collectOptionText(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') {
    result.push(value);
  } else if (Array.isArray(value)) {
    value.forEach((entry) => collectOptionText(entry, result));
  } else if (value && typeof value === 'object') {
    const entry = value as Record<string, unknown>;
    ['title', 'label', 'name', 'value', 'choices'].forEach((key) => collectOptionText(entry[key], result));
  }
  return result;
}

function itemTemperature(item: CompletedOrderItem): 'hot' | 'cold' {
  if (/lemonade/i.test(item.productName)) return 'cold';
  const values = collectOptionText(item.selectedOptions);
  for (const value of values) {
    const match = value.trim().match(/(?:^|:\s*)(hot|cold)\s*$/i);
    if (match) return match[1].toLowerCase() as 'hot' | 'cold';
  }
  // Temperature-less legacy drinks are counted as cold so every cup is represented.
  return 'cold';
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
  const [newEmail, setNewEmail] = useState('');

  const trendChartRef = useRef<HTMLDivElement>(null);
  const topProductsChartRef = useRef<HTMLDivElement>(null);

  const COLORS = ['#ff7f50', '#6495ed', '#ffd700', '#32cd32', '#ff69b4', '#20b2aa'];
  const MOBILE_COLORS = ['#111827', '#374151', '#6B7280', '#9CA3AF', '#D1D5DB', '#E5E7EB'];

  const handleDateChange = (selectedDate: string) => {
    console.info('[vendor-sales] selected date', selectedDate);
    setDate(selectedDate);
  };

  const fetchAll = async (targetDate = date) => {
    setLoading(true);
    try {
      const params = { date: targetDate };
      const analyticsRequests = [
        ['/analytics/vendor/summary', { params }],
        ['/analytics/vendor/product-trend', { params: { ...params, window: 5, top: 5 } }],
        ['/analytics/products', { params }],
        ['/analytics/vendor/orders', { params }],
      ] as const;
      console.info('[vendor-sales] fetching analytics', {
        selectedDate: targetDate,
        requests: analyticsRequests.map(([url, config]) => api.getUri({ url, ...config })),
      });
      const [s, pt, p, o, sett, orderLimit, usg] = await Promise.all([
        api.get(analyticsRequests[0][0], analyticsRequests[0][1]),
        api.get(analyticsRequests[1][0], analyticsRequests[1][1]),
        api.get(analyticsRequests[2][0], analyticsRequests[2][1]),
        api.get(analyticsRequests[3][0], analyticsRequests[3][1]),
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
    return products.reduce((total, product) => total + product.qtySold, 0);
  }, [products]);

  const temperatureSummary = useMemo(() => {
    let hot = 0;
    let cold = 0;
    orders.forEach((order) => order.items.forEach((item) => {
      if (itemTemperature(item) === 'hot') hot += item.qty;
      else cold += item.qty;
    }));
    return { hot, cold, total: hot + cold };
  }, [orders]);

  return (
    <>
      <div className="block [@media(pointer:coarse)]:hidden p-6 space-y-6">
        <h1 className="text-2xl font-bold">Vendor Sales Analytics</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-white rounded-xl shadow-sm border border-gray-100">
            <CardHeader>
              <CardTitle>Expected Cup Target</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Show Target</span>
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
                  <label className="text-sm text-gray-600">Expected Cup Quantity</label>
                  <div className="flex gap-2">
                    <Input 
                      type="number" 
                      defaultValue={settings?.dailyDrinkLimitQuantity}
                      onBlur={(e) => handleUpdateSettings({ dailyDrinkLimitQuantity: parseInt(e.target.value) })}
                      className="w-32"
                    />
                    <span className="text-sm self-center text-gray-500">cups</span>
                  </div>
                </div>
              )}

              <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700">Customer ordering closes automatically when this cup target is reached.</p>

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
              <CardTitle>Cup Target Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Cup progress</span>
                    <span className="font-bold">{usage?.usedQuantity || 0} / {usage?.dailyLimit || settings?.dailyDrinkLimitQuantity} drinks</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) >= 1 ? 'bg-red-600' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, ((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  {(usage?.usedQuantity || 0) >= (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1) && (
                    <p className="text-sm font-medium text-amber-700">Cup target has been reached. Customer ordering is closed.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600">Date</label>
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className="w-48" />
          </div>
          <Button onClick={() => fetchAll()} disabled={loading}>
            Refresh
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
            <CardTitle>Drink Temperature Summary</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="p-2">Drink Type</th>
                  <th className="p-2 text-right">Quantity</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b"><td className="p-2">Hot Drinks</td><td className="p-2 text-right">{temperatureSummary.hot}</td></tr>
                <tr className="border-b"><td className="p-2">Cold Drinks</td><td className="p-2 text-right">{temperatureSummary.cold}</td></tr>
                <tr className="bg-neutral-50 font-bold"><td className="p-2">Total Drinks</td><td className="p-2 text-right">{temperatureSummary.total}</td></tr>
              </tbody>
            </table>
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
                    </tr>
                  ))}
                  {products.length > 0 && (
                    <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                      <td className="p-2">Total</td>
                      <td className="p-2 text-right">{productTotals}</td>
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
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-gray-500">No orders for this date.</td></tr>
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
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Expected Cup Target</div>
            <div className="mt-3 space-y-4">
              <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-medium">Show Target</span>
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
                  <label className="text-xs text-neutral-500">Expected Cup Quantity</label>
                  <div className="flex min-w-0 items-center gap-2">
                    <Input 
                      type="number" 
                      defaultValue={settings?.dailyDrinkLimitQuantity}
                      onBlur={(e) => handleUpdateSettings({ dailyDrinkLimitQuantity: parseInt(e.target.value) })}
                      className="w-24 min-w-0"
                    />
                    <span className="min-w-0 text-xs text-neutral-500">cups</span>
                  </div>
                </div>
              )}

              <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700">Customer ordering closes automatically when this cup target is reached.</p>

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
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Cup Target Progress</div>
            <div className="mt-3 space-y-4">
              {settings?.dailyDrinkLimitEnabled && (
                <div className="space-y-2">
                  <div className="flex min-w-0 justify-between gap-3 text-xs">
                    <span className="text-neutral-500">Cup progress</span>
                    <span className="min-w-0 text-right font-bold">{usage?.usedQuantity || 0} / {usage?.dailyLimit || settings?.dailyDrinkLimitQuantity} drinks</span>
                  </div>
                  <div className="w-full bg-neutral-100 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) >= 1 ? 'bg-red-600' : 'bg-orange-500'}`}
                      style={{ width: `${Math.min(100, ((usage?.usedQuantity || 0) / (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1)) * 100)}%` }}
                    ></div>
                  </div>
                  {(usage?.usedQuantity || 0) >= (usage?.dailyLimit || settings?.dailyDrinkLimitQuantity || 1) && (
                    <p className="text-xs font-medium text-amber-700">Cup target has been reached. Customer ordering is closed.</p>
                  )}
                </div>
              )}

            </div>
          </Card>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Date</div>
          <div className="mt-2 grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} className="min-w-0" />
            <button
              onClick={() => fetchAll()}
              disabled={loading}
              className="h-10 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-black transition active:scale-[0.99] disabled:opacity-40"
            >
              Refresh
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
          <div className="text-sm font-semibold text-black">Drink Temperature Summary</div>
          <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-100 text-sm">
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b bg-neutral-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-neutral-500">
              <span>Drink Type</span><span>Quantity</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-3 py-2"><span>Hot Drinks</span><span>{temperatureSummary.hot}</span></div>
            <div className="grid grid-cols-[1fr_auto] gap-4 border-b px-3 py-2"><span>Cold Drinks</span><span>{temperatureSummary.cold}</span></div>
            <div className="grid grid-cols-[1fr_auto] gap-4 bg-neutral-50 px-3 py-2 font-bold"><span>Total Drinks</span><span>{temperatureSummary.total}</span></div>
          </div>
        </div>

        <div className="mt-4 w-full min-w-0 max-w-full bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-sm font-semibold text-black">Product Breakdown</div>
          <div className="mt-3 space-y-2">
            {products.length === 0 ? (
              <div className="text-sm text-neutral-600">No product data.</div>
            ) : (
              <>
                {products.map((p, idx) => (
                  <div key={idx} className="min-w-0 rounded-2xl border border-neutral-100 p-3">
                    <div className="break-words text-sm font-semibold text-black">{p.productName}</div>
                    <div className="mt-1 text-xs text-neutral-600">Qty Sold: <span className="font-semibold text-black">{p.qtySold}</span></div>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-neutral-100 p-3 font-bold text-black">
                  <span>Total</span>
                  <span className="text-right">{productTotals}</span>
                </div>
              </>
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

    </>
  );
}
