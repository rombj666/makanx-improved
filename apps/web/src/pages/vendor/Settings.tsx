import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import {
  Archive, CalendarDays, CheckCircle2, Copy, Download, Edit3, Eye,
  FileSpreadsheet, History, MapPin, Plus, QrCode, Search,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

type EventStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';

interface EventSummary {
  id: string;
  eventName: string;
  eventDate: string;
  location?: string | null;
  notes?: string | null;
  status: EventStatus;
  nextOrderNumber: number;
  completedAt?: string | null;
  createdAt: string;
  totalOrders: number;
  totalCups: number;
  totalSales: number;
}

interface EventOrder {
  id: string;
  eventOrderNumber: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  totalAmount: string | number;
  paymentStatus: string;
  status: string;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    status: string;
    remark?: string | null;
    menuItem: { name: string };
  }>;
}

const emptyForm = { eventName: '', eventDate: '', location: '', notes: '' };

function apiError(error: any) {
  return error?.response?.data?.error || error?.response?.data?.message || 'Something went wrong.';
}

function eventDate(value: string) {
  const date = value.slice(0, 10);
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-MY', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function money(value: number | string) {
  return `RM ${Number(value || 0).toFixed(2)}`;
}

function StatusBadge({ status }: { status: EventStatus }) {
  const style = status === 'ACTIVE'
    ? 'border-green-200 bg-green-50 text-green-700'
    : status === 'COMPLETED'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-neutral-200 bg-neutral-100 text-neutral-600';
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${style}`}>{status}</span>;
}

export function VendorSettings() {
  const { user } = useAuth();
  const canvasWrap = useRef<HTMLDivElement>(null);
  const [currentEvent, setCurrentEvent] = useState<EventSummary | null>(null);
  const [history, setHistory] = useState<EventSummary[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventModal, setEventModal] = useState<'create' | 'edit' | null>(null);
  const [completeModal, setCompleteModal] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [selectedEvent, setSelectedEvent] = useState<EventSummary | null>(null);
  const [orders, setOrders] = useState<EventOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const orderUrl = useMemo(() => {
    const vendorSlug = user?.vendorProfile?.slug || user?.vendorProfile?.id || '';
    return `${window.location.origin}/v/${encodeURIComponent(vendorSlug)}`;
  }, [user?.vendorProfile?.id, user?.vendorProfile?.slug]);

  const loadEvents = useCallback(async () => {
    try {
      const [current, historical] = await Promise.all([
        api.get('/vendor/events/current'),
        api.get('/vendor/events', { params: { includeArchived } }),
      ]);
      setCurrentEvent(current.data.data);
      setHistory(historical.data.data || []);
    } catch (error: any) {
      toast.error(apiError(error));
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  useEffect(() => { void loadEvents(); }, [loadEvents]);

  useEffect(() => {
    if (!selectedEvent) return;
    const timer = window.setTimeout(async () => {
      setOrdersLoading(true);
      try {
        const { data } = await api.get(`/vendor/events/${selectedEvent.id}/orders`, {
          params: { status: statusFilter || undefined, search: search || undefined },
        });
        setOrders(data.data.orders || []);
        setSelectedEvent(data.data.event);
      } catch (error: any) {
        toast.error(apiError(error));
      } finally {
        setOrdersLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search, selectedEvent?.id, statusFilter]);

  const copyLink = async () => {
    await navigator.clipboard.writeText(orderUrl);
    toast.success('Customer order link copied');
  };

  const downloadPng = () => {
    const canvas = canvasWrap.current?.querySelector('canvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'permanent-ordering-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const openCreate = () => {
    setForm({ ...emptyForm, eventDate: new Date().toISOString().slice(0, 10) });
    setEventModal('create');
  };

  const openEdit = () => {
    if (!currentEvent) return;
    setForm({
      eventName: currentEvent.eventName,
      eventDate: currentEvent.eventDate.slice(0, 10),
      location: currentEvent.location || '',
      notes: currentEvent.notes || '',
    });
    setEventModal('edit');
  };

  const saveEvent = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (eventModal === 'edit' && currentEvent) {
        await api.patch(`/vendor/events/${currentEvent.id}`, form);
        toast.success('Event updated');
      } else {
        await api.post('/vendor/events', form);
        toast.success('Event created and activated');
      }
      setEventModal(null);
      await loadEvents();
    } catch (error: any) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const completeEvent = async () => {
    if (!currentEvent) return;
    setSaving(true);
    try {
      await api.post(`/vendor/events/${currentEvent.id}/complete`);
      toast.success('Event completed. New orders are now closed.');
      setCompleteModal(false);
      await loadEvents();
    } catch (error: any) {
      toast.error(apiError(error));
    } finally {
      setSaving(false);
    }
  };

  const archiveEvent = async (item: EventSummary) => {
    if (!window.confirm(`Archive “${item.eventName}”? Its orders will be kept.`)) return;
    try {
      await api.post(`/vendor/events/${item.id}/archive`);
      toast.success('Event archived');
      await loadEvents();
    } catch (error: any) {
      toast.error(apiError(error));
    }
  };

  const downloadExport = async (item: EventSummary, format: 'csv' | 'xlsx') => {
    try {
      const response = await api.get(`/vendor/events/${item.id}/export.${format}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.eventName.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'event'}-orders.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast.error(apiError(error));
    }
  };

  return (
    <main className="mx-auto w-full max-w-6xl overflow-x-hidden px-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-950">Settings</h1>

      <section className="mt-6 min-w-0 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-neutral-100 p-3"><QrCode size={24} /></div>
          <div>
            <h2 className="text-lg font-bold">Permanent QR Code</h2>
            <p className="text-sm text-neutral-600">Customers can scan this code to order for the currently active event.</p>
          </div>
        </div>
        <div className="mt-6 grid min-w-0 gap-6 sm:grid-cols-[220px_1fr] sm:items-center">
          <div ref={canvasWrap} className="mx-auto rounded-2xl border bg-white p-4">
            <QRCodeCanvas value={orderUrl} size={184} level="H" marginSize={1} />
          </div>
          <div className="min-w-0">
            <label className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Customer order URL</label>
            <div className="mt-2 break-all rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-800">{orderUrl}</div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button onClick={copyLink} className="flex h-11 items-center justify-center gap-2 rounded-xl border font-semibold"><Copy size={17} />Copy Link</button>
              <button onClick={downloadPng} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-black font-semibold text-white"><Download size={17} />Download QR PNG</button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-neutral-100 p-3"><CalendarDays size={24} /></div>
          <h2 className="text-lg font-bold">Current Event</h2>
        </div>
        {loading ? (
          <p className="mt-6 text-sm text-neutral-500">Loading event…</p>
        ) : currentEvent ? (
          <div className="mt-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xl font-bold">{currentEvent.eventName}</h3>
                  <StatusBadge status={currentEvent.status} />
                </div>
                <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-neutral-600">
                  <span className="flex items-center gap-1.5"><CalendarDays size={15} />{eventDate(currentEvent.eventDate)}</span>
                  <span className="flex items-center gap-1.5"><MapPin size={15} />{currentEvent.location || 'No location'}</span>
                </div>
                <p className="mt-2 text-xs text-neutral-500">Created {new Date(currentEvent.createdAt).toLocaleString()}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={openEdit}><Edit3 size={16} className="mr-2" />Edit Event</Button>
                <Button className="bg-black hover:bg-neutral-800" onClick={() => setCompleteModal(true)}><CheckCircle2 size={16} className="mr-2" />Complete Event</Button>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ['Total orders', currentEvent.totalOrders],
                ['Total cups', currentEvent.totalCups],
                ['Total sales', money(currentEvent.totalSales)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</div>
                  <div className="mt-1 text-2xl font-bold">{value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="font-semibold">No active event currently.</p>
            <p className="mt-1 text-sm text-neutral-500">Create an event to open ordering through the permanent QR code.</p>
            <Button className="mt-5 bg-black hover:bg-neutral-800" onClick={openCreate}><Plus size={17} className="mr-2" />Create and Activate Event</Button>
          </div>
        )}
      </section>

      <section className="mt-6 rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-8">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-neutral-100 p-3"><History size={24} /></div>
            <div><h2 className="text-lg font-bold">Event History</h2><p className="text-sm text-neutral-600">Past event orders remain available and exportable.</p></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-neutral-600">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead><tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
              {['Event Name', 'Event Date', 'Location', 'Total Orders', 'Total Cups', 'Total Sales', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}
            </tr></thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b border-neutral-100 last:border-0">
                  <td className="px-3 py-4 font-semibold">{item.eventName}</td>
                  <td className="px-3 py-4">{eventDate(item.eventDate)}</td>
                  <td className="px-3 py-4 text-neutral-600">{item.location || '—'}</td>
                  <td className="px-3 py-4">{item.totalOrders}</td>
                  <td className="px-3 py-4">{item.totalCups}</td>
                  <td className="px-3 py-4">{money(item.totalSales)}</td>
                  <td className="px-3 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-4"><div className="flex flex-wrap gap-2">
                    <button onClick={() => { setOrders([]); setSearch(''); setStatusFilter(''); setSelectedEvent(item); }} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 font-semibold"><Eye size={14} />View Orders</button>
                    <button onClick={() => downloadExport(item, 'csv')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 font-semibold"><Download size={14} />CSV</button>
                    <button onClick={() => downloadExport(item, 'xlsx')} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-2 font-semibold"><FileSpreadsheet size={14} />Excel</button>
                    {item.status === 'COMPLETED' && <button onClick={() => archiveEvent(item)} title="Archive event" className="rounded-lg border px-2.5 py-2 text-neutral-600"><Archive size={14} /></button>}
                  </div></td>
                </tr>
              ))}
              {!loading && history.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-neutral-500">No completed events yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal isOpen={eventModal !== null} onClose={() => setEventModal(null)} title={eventModal === 'edit' ? 'Edit Event' : 'Create and Activate Event'}>
        <form onSubmit={saveEvent} className="space-y-4">
          <label className="block text-sm font-semibold">Event name<Input className="mt-1.5" required maxLength={160} value={form.eventName} onChange={(e) => setForm({ ...form, eventName: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Event date<Input className="mt-1.5" type="date" required value={form.eventDate} onChange={(e) => setForm({ ...form, eventDate: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Location <span className="font-normal text-neutral-500">(optional)</span><Input className="mt-1.5" maxLength={240} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></label>
          <label className="block text-sm font-semibold">Notes <span className="font-normal text-neutral-500">(optional)</span><textarea className="mt-1.5 min-h-24 w-full rounded-md border px-3 py-2 text-sm" maxLength={2000} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setEventModal(null)}>Cancel</Button><Button type="submit" isLoading={saving} className="bg-black hover:bg-neutral-800">{eventModal === 'edit' ? 'Save Changes' : 'Create and Activate Event'}</Button></div>
        </form>
      </Modal>

      <Modal isOpen={completeModal} onClose={() => setCompleteModal(false)} title="Complete Event?">
        <p className="text-sm leading-6 text-neutral-600">This will stop new customer orders for this event and move the event to Event History. Existing orders will not be deleted.</p>
        <div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={() => setCompleteModal(false)}>Cancel</Button><Button isLoading={saving} className="bg-black hover:bg-neutral-800" onClick={completeEvent}>Yes, Complete Event</Button></div>
      </Modal>

      <Modal wide isOpen={selectedEvent !== null} onClose={() => setSelectedEvent(null)} title={selectedEvent ? `${selectedEvent.eventName} — Orders` : 'Event Orders'}>
        {selectedEvent && <div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[['Total orders', selectedEvent.totalOrders], ['Total cups', selectedEvent.totalCups], ['Total sales', money(selectedEvent.totalSales)]].map(([label, value]) => <div key={label} className="rounded-xl bg-neutral-100 p-3"><div className="text-xs uppercase text-neutral-500">{label}</div><div className="mt-1 text-lg font-bold">{value}</div></div>)}
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_190px]">
            <label className="relative"><Search className="absolute left-3 top-3 text-neutral-400" size={16} /><Input className="pl-9" placeholder="Search order no. or customer" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm"><option value="">All order statuses</option><option value="PREPARING">Preparing</option><option value="READY">Ready</option></select>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase text-neutral-500">{['Order No.', 'Customer', 'Items', 'Cups', 'Amount', 'Payment', 'Status', 'Created'].map((heading) => <th key={heading} className="px-3 py-3">{heading}</th>)}</tr></thead>
              <tbody>{orders.map((order) => <tr key={order.id} className="border-b border-neutral-100 align-top"><td className="px-3 py-4 text-lg font-bold">#{order.eventOrderNumber}</td><td className="px-3 py-4"><div className="font-medium">{order.customerName || 'Guest'}</div><div className="text-xs text-neutral-500">{order.customerPhone || order.customerEmail || 'No contact details'}</div></td><td className="px-3 py-4">{order.items.map((item) => <div key={item.id}>{item.quantity}x {item.menuItem.name}{item.remark ? <span className="text-neutral-500"> — {item.remark}</span> : null}</div>)}</td><td className="px-3 py-4">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td><td className="px-3 py-4">{money(order.totalAmount)}</td><td className="px-3 py-4">{order.paymentStatus}</td><td className="px-3 py-4">{order.status}</td><td className="px-3 py-4 whitespace-nowrap">{new Date(order.createdAt).toLocaleString()}</td></tr>)}
                {!ordersLoading && orders.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-neutral-500">No matching orders.</td></tr>}
              </tbody></table>
            {ordersLoading && <p className="py-6 text-center text-sm text-neutral-500">Loading orders…</p>}
          </div>
        </div>}
      </Modal>
    </main>
  );
}
