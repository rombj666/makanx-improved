import { useEffect, useMemo, useState, useRef } from 'react';
import { api } from '../../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { toPng } from 'html-to-image';
import { useAuth } from '../../context/AuthContext';

interface Summary {
  orders: number;
}

interface ProductPerf {
  productName: string;
  qtySold: number;
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
}
interface CompletedOrder {
  orderNumber: string;
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

  const trendChartRef = useRef<HTMLDivElement>(null);
  const topProductsChartRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();

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

  const handleExport = async () => {
    if (orders.length === 0) {
      toast.error('No completed orders to export');
      return;
    }

    const toastId = toast.loading('Generating professional report...');
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sales Report');

      // 1. Column Configuration
      worksheet.columns = [
        { header: 'A', key: 'a', width: 20 },
        { header: 'B', key: 'b', width: 20 },
        { header: 'C', key: 'c', width: 15 },
        { header: 'D', key: 'd', width: 25 },
        { header: 'E', key: 'e', width: 45 },
      ];

      // 2. Report Header
      const titleCell = worksheet.getCell('A1');
      titleCell.value = 'Vendor Sales Analytics Report';
      titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      worksheet.mergeCells('A1:F2');

      // 3. Metadata Section
      worksheet.addRow([]);
      const metaStart = worksheet.lastRow!.number + 1;
      worksheet.addRow(['Vendor Name:', user?.vendorProfile?.businessName || 'N/A']);
      worksheet.addRow(['Report Date:', date]);
      worksheet.addRow(['Generated At:', format(new Date(), 'yyyy-MM-dd HH:mm:ss')]);
      
      for (let i = metaStart; i < metaStart + 3; i++) {
        worksheet.getCell(`A${i}`).font = { bold: true };
      }

      // 4. KPI Summary Section
      worksheet.addRow([]);
      worksheet.addRow(['KPI SUMMARY']).font = { bold: true, size: 14 };
      const kpiHeaderRow = worksheet.addRow(['Total Orders']);
      kpiHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      kpiHeaderRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF444444' } };
        c.alignment = { horizontal: 'center' };
      });

      const kpiValueRow = worksheet.addRow([
        summary?.orders ?? 0
      ]);
      kpiValueRow.alignment = { horizontal: 'center' };
      kpiValueRow.font = { size: 12 };

      // 5. Chart Capture and Embedding
      worksheet.addRow([]);
      worksheet.addRow([]);
      const chartRow = worksheet.lastRow!.number + 1;
      
      // Capture charts
      let trendImageId, topProductsImageId;
      
      if (trendChartRef.current) {
        const trendDataUrl = await toPng(trendChartRef.current, { backgroundColor: '#ffffff' });
        trendImageId = workbook.addImage({
          base64: trendDataUrl,
          extension: 'png',
        });
      }

      if (topProductsChartRef.current) {
        const topProductsDataUrl = await toPng(topProductsChartRef.current, { backgroundColor: '#ffffff' });
        topProductsImageId = workbook.addImage({
          base64: topProductsDataUrl,
          extension: 'png',
        });
      }

      // Position charts
      if (trendImageId !== undefined) {
        worksheet.getCell(`A${chartRow}`).value = 'Product Trend Analysis';
        worksheet.getCell(`A${chartRow}`).font = { bold: true, size: 12 };
        worksheet.addImage(trendImageId, {
          tl: { col: 0.2, row: chartRow + 1 },
          ext: { width: 550, height: 300 }
        });
      }

      if (topProductsImageId !== undefined) {
        worksheet.getCell(`E${chartRow}`).value = 'Top Products Distribution';
        worksheet.getCell(`E${chartRow}`).font = { bold: true, size: 12 };
        worksheet.addImage(topProductsImageId, {
          tl: { col: 4.2, row: chartRow + 1 },
          ext: { width: 350, height: 300 }
        });
      }

      // Skip rows for charts
      for (let i = 0; i < 18; i++) worksheet.addRow([]);

      // 6. Data Tables
      // Product Performance Table
      worksheet.addRow(['PRODUCT PERFORMANCE BREAKDOWN']).font = { bold: true, size: 14 };
      const prodHeader = worksheet.addRow(['Product', 'Quantity Sold']);
      prodHeader.font = { bold: true };
      prodHeader.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        c.border = { bottom: { style: 'thin' }, top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      products.forEach(p => {
        const row = worksheet.addRow([
          p.productName, 
          p.qtySold
        ]);
        row.getCell(2).alignment = { horizontal: 'right' };
      });

      // Total row for products
      const prodTotalRow = worksheet.addRow([
        'Total',
        productTotals.qty
      ]);
      prodTotalRow.font = { bold: true };
      prodTotalRow.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        c.border = { top: { style: 'medium' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      prodTotalRow.getCell(2).alignment = { horizontal: 'right' };

      worksheet.addRow([]);

      // Detailed Orders Table
      worksheet.addRow(['COMPLETED ORDERS DETAILS']).font = { bold: true, size: 14 };
      const orderHeader = worksheet.addRow(['Order #', 'Created Time', 'Completed Time', 'Total Quantity', 'Items Summary']);
      orderHeader.font = { bold: true };
      orderHeader.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
        c.border = { bottom: { style: 'thin' }, top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });

      orders.forEach(o => {
        const orderQty = o.items.reduce((s, it) => s + it.qty, 0);
        const itemsSummary = o.items.map((it) => `${it.qty}x ${it.productName}`).join(', ');
        worksheet.addRow([
          o.orderNumber,
          new Date(o.createdAt).toLocaleTimeString(),
          o.completedAt ? new Date(o.completedAt).toLocaleTimeString() : '-',
          orderQty,
          itemsSummary
        ]);
      });

      // Styling cleanups
      worksheet.views = [{ state: 'frozen', ySplit: 2 }];

      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer]), `vendor-sales-report-${date}.xlsx`);
      toast.success('Report exported successfully!', { id: toastId });
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Failed to export report.', { id: toastId });
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

        <div className="flex items-center gap-4">
          <div>
            <label className="text-sm text-gray-600">Date</label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Button onClick={fetchAll} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={loading}>
            Export
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
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2">{p.productName}</td>
                      <td className="p-2 text-right">{p.qtySold}</td>
                    </tr>
                  ))}
                  {products.length > 0 && (
                    <tr className="bg-neutral-50 font-bold border-t-2 border-neutral-200">
                      <td className="p-2">Total</td>
                      <td className="p-2 text-right">{productTotals.qty}</td>
                    </tr>
                  )}
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
                  <th className="p-2">Items</th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr><td colSpan={4} className="p-6 text-center text-sm text-gray-500">No completed orders.</td></tr>
                ) : (
                  orders.map((o, idx) => (
                    <tr key={idx} className="border-b align-top">
                      <td className="p-2">{o.orderNumber}</td>
                      <td className="p-2">{new Date(o.createdAt).toLocaleTimeString()}</td>
                      <td className="p-2">{o.completedAt ? new Date(o.completedAt).toLocaleTimeString() : '-'}</td>
                      <td className="p-2">
                        <ul>
                          {o.items.map((it, i) => (
                            <li key={i}>
                              {it.qty}x {it.productName}
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={fetchAll}
              disabled={loading}
              className="h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm disabled:opacity-40 active:scale-[0.99] transition"
            >
              Refresh
            </button>
            <button
              onClick={handleExport}
              disabled={loading}
              className="h-11 px-4 rounded-2xl bg-white border border-neutral-200 text-black font-semibold text-sm disabled:opacity-40 active:scale-[0.99] transition"
            >
              Export
            </button>
          </div>
        </div>

        <div className="mt-4 bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
          <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Date</div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-2" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3">
          <div className="bg-white rounded-3xl border border-neutral-100 shadow-sm p-4">
            <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Orders</div>
            <div className="mt-2 text-2xl font-semibold text-black">{summary?.orders ?? 0}</div>
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
                    Qty: {p.qtySold}
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
                  </div>
                  <div className="mt-3 space-y-1">
                    {o.items.map((it, i) => (
                      <div key={i} className="text-xs text-neutral-700">
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
