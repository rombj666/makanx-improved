import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { getOrCreateDeviceId } from '../../lib/deviceOrderLock';
import { useCustomerCart } from '../../hooks/useCustomerCart';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  optionGroups?: any[];
  remarksEnabled?: boolean;
}

interface Store {
  id: string;
  businessName: string;
  description?: string;
  settings?: {
    orderingOpen: boolean;
    deviceOrderLimitEnabled: boolean;
    maxDrinksPerOrder: number;
  };
  menuItems: MenuItem[];
}

export function CustomerOrderPage() {
  const { vendorId = '' } = useParams();
  const navigate = useNavigate();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const cart = useCustomerCart({
    storeId: vendorId,
    vendorId,
    vendorName: store?.businessName || '',
    maxItems: store?.settings?.deviceOrderLimitEnabled ? store.settings.maxDrinksPerOrder : 99,
  });

  useEffect(() => {
    api.get(`/menu-items/public/${vendorId}`)
      .then(({ data }) => setStore(data.data))
      .catch(() => toast.error('Store menu could not be loaded'))
      .finally(() => setLoading(false));
  }, [vendorId]);

  const menu = useMemo(() => store?.menuItems || [], [store]);

  const checkout = async () => {
    if (!store?.settings?.orderingOpen || cart.lines.length === 0) return;
    setPlacing(true);
    try {
      const { data } = await api.post('/orders', {
        vendorId,
        guestId: getOrCreateGuestId(),
        deviceId: getOrCreateDeviceId(),
        paymentMode: 'PAY_AT_COUNTER',
        items: cart.lines.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          remark: line.remark,
          selectedOptions: line.selectedOptions || [],
        })),
      });
      cart.clear();
      toast.success(`Order #${data.data.order.displayNumber} placed`);
      navigate(`/track/${data.data.order.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.response?.data?.message || 'Checkout failed');
    } finally {
      setPlacing(false);
    }
  };

  if (loading) return <div className="p-10 text-center">Loading menu...</div>;
  if (!store) return <div className="p-10 text-center">Store not found.</div>;

  return (
    <main className="min-h-screen overflow-x-hidden bg-neutral-50 pb-44">
      <header className="bg-black px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">Smart QR Ordering System</div>
          <h1 className="mt-2 text-3xl font-bold">{store.businessName}</h1>
          {store.description && <p className="mt-2 max-w-xl text-neutral-300">{store.description}</p>}
          {!store.settings?.orderingOpen && <p className="mt-4 rounded-xl bg-red-500/20 p-3 text-sm text-red-100">Ordering is currently closed.</p>}
        </div>
      </header>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-4 px-4 py-6 sm:grid-cols-2">
        {menu.map((item) => (
          <article key={item.id} className="min-w-0 rounded-3xl border border-neutral-200 bg-white p-4 shadow-sm">
            {item.imageUrl && <img src={item.imageUrl} alt="" className="h-40 w-full rounded-2xl object-cover" />}
            <div className="mt-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="break-words font-bold">{item.name}</h2>
                {item.description && <p className="mt-1 text-sm text-neutral-600">{item.description}</p>}
              </div>
              <span className="shrink-0 font-bold">RM{Number(item.price).toFixed(2)}</span>
            </div>
            <button
              disabled={!store.settings?.orderingOpen}
              onClick={() => cart.addLine({ menuItemId: item.id, name: item.name, price: Number(item.price), quantity: 1, remark: '', imageUrl: item.imageUrl || '', selectedOptions: [], remarksEnabled: item.remarksEnabled })}
              className="mt-4 h-11 w-full rounded-xl bg-black font-semibold text-white disabled:bg-neutral-300"
            >
              Add to order
            </button>
          </article>
        ))}
      </div>

      {cart.totalItems > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-4 shadow-2xl">
          <div className="mx-auto max-w-4xl">
            <div className="max-h-40 space-y-2 overflow-y-auto">
              {cart.lines.map((line) => (
                <div key={line.id} className="flex min-w-0 items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 flex-1 truncate font-semibold">{line.name}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <button onClick={() => cart.updateQuantity(line.id, line.quantity - 1)} className="h-8 w-8 rounded-lg border">{line.quantity === 1 ? <Trash2 className="m-auto" size={14} /> : <Minus className="m-auto" size={14} />}</button>
                    <span className="w-5 text-center">{line.quantity}</span>
                    <button onClick={() => cart.updateQuantity(line.id, line.quantity + 1)} className="h-8 w-8 rounded-lg border"><Plus className="m-auto" size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={checkout} disabled={placing} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-black font-bold text-white disabled:opacity-50">
              <ShoppingBag size={18} />{placing ? 'Placing order...' : `Checkout · RM${cart.total.toFixed(2)}`}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
