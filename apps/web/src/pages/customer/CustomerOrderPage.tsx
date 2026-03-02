
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { MyOrdersBar } from '../../components/customer/MyOrdersBar';
import { MobileOrdersSidebar } from '../../components/customer/MobileOrdersSidebar';
import { useCustomerOrders } from '../../hooks/useCustomerOrders';
import { enableSound, primeReadySound, isSoundEnabled } from '../../lib/alerts';

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
}

interface Booth {
  id: string;
  name: string;
  vendor?: {
    id: string;
    businessName: string;
    description?: string;
    menuItems?: MenuItem[];
  };
}

export function CustomerOrderPage() {
  const { slug, vendorId } = useParams();
  const navigate = useNavigate();
  const [booth, setBooth] = useState<Booth | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [isPlacing, setIsPlacing] = useState(false);
  const [confirmed, setConfirmed] = useState<{ number: string; eta: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { addOrUpdate } = useCustomerOrders(slug || '');
  const enableNotification = async () => {
    console.log("Starting push enable...");
    try {
      if (!('serviceWorker' in navigator)) {
        console.error("Service worker not supported");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      console.log("SW registration:", registration);

      const existing = await registration.pushManager.getSubscription();
      console.log("Existing subscription:", existing);

      const permission = await Notification.requestPermission();
      console.log("Notification permission:", permission);

      if (permission !== 'granted') {
        console.error("Permission denied");
        return;
      }
      const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        alert('Notification configuration error.');
        return;
      }
      const convertedKey = (function urlBase64ToUint8Array(base64String: string) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      })(publicKey as string);
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });
      console.log("Created subscription:", subscription);

      const customerId = getOrCreateGuestId();
      const resp = await api.post('/push/subscribe', {
        customerId,
        subscription: {
          endpoint: subscription.endpoint,
          keys: subscription.toJSON().keys,
        },
      });
      console.log("Subscription sent to backend:", resp.status, resp.data);
      alert('Notifications enabled!');
      navigate(`/customer/event/${slug}`);
    } catch (error) {
      console.error("Enable notification error:", error);
      alert('Failed to enable notifications.');
    }
  };

  useEffect(() => {
    const run = async () => {
      if (!slug || !vendorId) return;
      try {
        const { data } = await api.get(`/events/${slug}`);
        if (data.success) {
          const event = data.data;
          const found = (event.booths || []).find((b: any) => b.vendor?.id === vendorId) || null;
          setBooth(found);
        }
      } catch (e: any) {
        setError('Failed to load vendor menu');
      }
    };
    run();
  }, [slug, vendorId]);

  const menu: MenuItem[] = useMemo(() => {
    if (!booth?.vendor?.menuItems) return [];
    return booth.vendor.menuItems.map((m: any) => ({ ...m, price: Number(m.price) }));
  }, [booth]);

  const add = (id: string) => {
    setQuantities((q) => ({ ...q, [id]: (q[id] || 0) + 1 }));
  };
  const sub = (id: string) => {
    setQuantities((q) => {
      const n = Math.max(0, (q[id] || 0) - 1);
      const next = { ...q, [id]: n };
      if (n === 0) delete next[id];
      return next;
    });
  };

  const items = useMemo(
    () => Object.entries(quantities).filter(([, qty]) => qty > 0).map(([menuItemId, quantity]) => ({ menuItemId, quantity })),
    [quantities]
  );

  const total = useMemo(() => {
    return items.reduce((sum, it) => {
      const m = menu.find((mi) => mi.id === it.menuItemId);
      return sum + (m ? m.price * it.quantity : 0);
    }, 0);
  }, [items, menu]);

  const placeOrder = async () => {
    if (!vendorId || items.length === 0) return;
    setIsPlacing(true);
    setError(null);
    try {
      const guestId = getOrCreateGuestId();

      const res = await api.post('/orders', {
        vendorId,
        items,
        paymentMode: 'PAY_AT_BOOTH',
        guestId,
      });
      if (res.data?.success) {
        const { order, estimatedMinutes } = res.data.data;
        const raw =
          order?.boothOrderNumber ??
          order?.displayNumber ??
          order?.orderNumber ??
          order?.sequence ??
          null;
        const displayNumber =
          raw !== null && raw !== undefined && `${raw}`.trim() !== ''
            ? String(raw).toUpperCase()
            : String(order.id || '').slice(-4).toUpperCase();
        setConfirmed({ number: displayNumber, eta: estimatedMinutes });
        addOrUpdate({
          orderId: order.id,
          vendorId: order.vendorId,
          vendorName: booth?.vendor?.businessName || '',
          status: order.status,
          estimatedMinutes: Math.max(Number(estimatedMinutes ?? 0), 0),
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
          displayNumber,
        });
      } else {
        setError('Order failed');
      } 
    } catch (e: any) {
      setError(e.response?.data?.error || 'Order failed');
    } finally {
      setIsPlacing(false);
    }
  };

  if (confirmed) {
    const showSoundPrompt =
      (typeof window !== 'undefined') &&
      localStorage.getItem('mx_sound_prompted') !== '1' &&
      !isSoundEnabled();
    const onEnableSound = () => {
      enableSound();
      primeReadySound();
      try { localStorage.setItem('mx_sound_prompted', '1'); } catch {}
      navigate(`/customer/event/${slug}`);
    };
    const onNotNow = () => {
      try { localStorage.setItem('mx_sound_prompted', '1'); } catch {}
    };
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold">Order Confirmed</h1>
          <p className="text-gray-600">Your Number</p>
          <div className="text-5xl font-extrabold tracking-tight">#{confirmed.number}</div>
          <p className="text-gray-500">Estimated Time: ~{confirmed.eta} minutes</p>
          {showSoundPrompt && (
            <div className="mt-3 p-3 border rounded-lg text-sm">
              <div className="mb-2">Enable sound alerts when your order is READY?</div>
              <div className="flex items-center gap-2 justify-center">
                <button onClick={onEnableSound} className="px-3 py-2 rounded bg-black text-white">Enable</button>
                <button onClick={onNotNow} className="px-3 py-2 rounded border">Not now</button>
              </div>
            </div>
          )}
          <div className="mt-3 p-3 border rounded-lg text-sm">
            <div className="mb-2">Enable Order Notifications 🔔</div>
            <div className="flex items-center gap-2 justify-center">
              <button
                onClick={enableNotification}
                className="px-3 py-2 rounded bg-black text-white"
              >
                Enable Order Notifications
              </button>
            </div>
          </div>
          <button
            onClick={() => navigate(`/customer/event/${slug}`)}
            className="mt-4 px-4 py-2 rounded-lg bg-black text-white"
          >
            Back to Map
          </button>
        </div>
        {/* Responsive orders UI */}
        <div className="lg:hidden">
          <MobileOrdersSidebar eventSlug={String(slug)} />
        </div>
        <div className="hidden lg:block">
          <MyOrdersBar eventSlug={String(slug)} />
        </div>
      </div>
    );
  }

  if (!booth) {
    return (
      <div className="w-full h-full bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Loading...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">{booth.vendor?.businessName || booth.name}</h1>
        <p className="text-sm text-gray-500">Booth {booth.name}</p>
        {booth.vendor?.description && (
          <p className="text-gray-600 mt-1">{booth.vendor.description}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {menu.length === 0 ? (
          <p className="text-gray-500">No menu items.</p>
        ) : (
          menu.map((item) => (
            <div key={item.id} className="flex items-center justify-between border rounded-lg p-4">
              <div>
                <div className="font-medium">{item.name}</div>
                <div className="text-sm text-gray-500">${item.price.toFixed(2)}</div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => sub(item.id)}
                  className="w-9 h-9 rounded-full border text-lg leading-none"
                >
                  -
                </button>
                <div className="w-8 text-center">{quantities[item.id] || 0}</div>
                <button
                  onClick={() => add(item.id)}
                  className="w-9 h-9 rounded-full border text-lg leading-none"
                >
                  +
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="p-6 border-t">
        <div className="flex justify-between mb-4">
          <span className="font-semibold">Total</span>
          <span className="font-bold">${total.toFixed(2)}</span>
        </div>
        <button
          onClick={placeOrder}
          disabled={items.length === 0 || isPlacing}
          className="w-full bg-black text-white py-3 rounded-xl disabled:opacity-50"
        >
          {isPlacing ? 'Placing...' : 'Place Order'}
        </button>
      </div>
      <div className="lg:hidden">
        <MobileOrdersSidebar eventSlug={String(slug || '')} />
      </div>
      <div className="hidden lg:block">
        <MyOrdersBar eventSlug={String(slug)} />
      </div>
    </div>
  );
}
