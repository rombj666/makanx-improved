import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { api } from '../../lib/api';
import { format } from 'date-fns';

interface VendorAgg {
  vendorId: string;
  vendorName: string;
  orderCount: number;
  revenue: number;
}

export function OrganizerVendorSales() {
  const { vendorId } = useParams();
  const navigate = useNavigate();
  const [date, setDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [eventId, setEventId] = useState<string>('');
  const [vendor, setVendor] = useState<VendorAgg | null>(null);
  const [events, setEvents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

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

  const fetchVendorAgg = async () => {
    if (!eventId || !vendorId) return;
    setLoading(true);
    try {
      const params = { eventId, date };
      const res = await api.get('/analytics/organizer/vendors', { params });
      const list: VendorAgg[] = res.data.data || [];
      const found = list.find((v) => v.vendorId === vendorId) || null;
      setVendor(found);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  useEffect(() => {
    fetchVendorAgg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, date, vendorId]);

  const title = useMemo(() => vendor?.vendorName || 'Vendor Sales', [vendor]);

  return (
    <div className="p-6 space-y-6">
      <button
        onClick={() => navigate('/organizer/sales')}
        className="mb-4 text-sm text-orange-600 hover:underline"
      >
        ← Back to Sales Dashboard
      </button>
      <h1 className="text-2xl font-bold">{title}</h1>

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
        <Button onClick={fetchVendorAgg} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <Card className="bg-white rounded-xl shadow-sm p-6">
          <CardHeader>
            <CardTitle>Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${(vendor?.revenue ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-white rounded-xl shadow-sm p-6">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{vendor?.orderCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-white rounded-xl shadow-sm p-6">
          <CardHeader>
            <CardTitle>Average Order</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ${(((vendor?.revenue ?? 0) / Math.max(1, vendor?.orderCount ?? 0))).toFixed(2)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white rounded-xl shadow-sm p-6">
        <CardHeader>
          <CardTitle>Product Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-gray-600">Per-vendor product breakdown will be added next.</div>
        </CardContent>
      </Card>
    </div>
  );
}
