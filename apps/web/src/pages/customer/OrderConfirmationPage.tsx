import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enableSound, primeReadySound } from '../../lib/alerts';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { getExistingPushSubscription, subscribeToPush } from '../../lib/push';

interface OrderState {
  orderId?: string;
  orderNumber?: string;
  eta?: number;
  eventSlug?: string;
  items?: { name: string; quantity: number; remark?: string }[];
}

export function OrderConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const orderFromState = (location.state || null) as OrderState | null;

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderIdFromQuery = searchParams.get('orderId') || undefined;
  const eventSlugFromQuery = searchParams.get('eventSlug') || undefined;

  const [resolvedOrder, setResolvedOrder] = useState<OrderState | null>(orderFromState);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (orderFromState) {
      setResolvedOrder(orderFromState);
      setLoadError(null);
      return;
    }
    if (!orderIdFromQuery) return;

    const run = async () => {
      try {
        const guestId = getOrCreateGuestId();
        const { data } = await api.get('/orders/my-orders', { params: { guestId } });
        const list: any[] = Array.isArray(data?.data) ? data.data : [];
        const found = list.find((o) => String(o?.id || '') === String(orderIdFromQuery));
        if (!found) {
          setLoadError('Order not found.');
          setResolvedOrder(null);
          return;
        }
        const raw =
          found?.boothOrderNumber ??
          found?.displayNumber ??
          found?.orderNumber ??
          found?.sequence ??
          null;
        const orderNumber =
          raw !== null && raw !== undefined && `${raw}`.trim() !== ''
            ? String(raw).toUpperCase()
            : String(found?.id || '').slice(-4).toUpperCase();
        const items = Array.isArray(found?.items)
          ? found.items.map((it: any) => ({
              name: it?.menuItem?.name || '',
              quantity: Number(it?.quantity ?? 0),
              remark: it?.remark || '',
            }))
          : [];
        setResolvedOrder({
          orderId: String(found.id),
          orderNumber,
          eta: Math.max(Number(found?.estimatedMinutes ?? 5), 0),
          eventSlug: eventSlugFromQuery || '',
          items,
        });
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load order.');
        setResolvedOrder(null);
      }
    };
    run();
  }, [orderFromState, orderIdFromQuery, eventSlugFromQuery]);

  const order = resolvedOrder;
  const orderId = order?.orderId || orderIdFromQuery;
  const orderNumber = order?.orderNumber || (orderId ? orderId.slice(-4).toUpperCase() : 'Unknown');
  const eta = order?.eta ?? 5;
  const eventSlug = order?.eventSlug || eventSlugFromQuery || '';
  const items = useMemo(() => (Array.isArray(order?.items) ? order!.items! : []), [order]);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('soundEnabled') === 'true';
  });

  const toggleSound = () => {
    const v = !soundEnabled;
    setSoundEnabled(v);
    try {
      localStorage.setItem('soundEnabled', String(v));
    } catch {}
    if (v) {
      enableSound();
      primeReadySound();
    }
  };

  const [pushUiState, setPushUiState] = useState<
    'checking' | 'available' | 'enabled' | 'blocked' | 'not_supported'
  >('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (typeof window === 'undefined') return;
      const supported =
        'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!supported) {
        setPushUiState('not_supported');
        return;
      }
      if (Notification.permission === 'denied') {
        setPushUiState('blocked');
        return;
      }
      if (Notification.permission === 'granted') {
        const sub = await getExistingPushSubscription();
        setPushUiState(sub ? 'enabled' : 'available');
        return;
      }
      setPushUiState('available');
    };
    run();
  }, []);

  const enableNotification = async () => {
    try {
      if (pushBusy) return;
      setPushBusy(true);
      setPushError(null);
      const guestId = getOrCreateGuestId();
      const result = await subscribeToPush(guestId);

      if (result.status === 'enabled') {
        setPushUiState('enabled');
      } else if (result.status === 'blocked') {
        setPushUiState('blocked');
      } else if (result.status === 'not_supported') {
        setPushUiState('not_supported');
      } else if (result.status === 'dismissed') {
        setPushUiState('available');
      } else {
        setPushUiState('available');
        setPushError(result.error || 'Failed to enable notifications.');
      }
    } catch (err) {
      console.error(err);
      setPushError('Failed to enable notifications.');
    }
    setPushBusy(false);
  };

  useEffect(() => {
    if (order || orderIdFromQuery) return;
    navigate('/', { replace: true });
  }, [navigate, order, orderIdFromQuery]);

  if (!order && orderIdFromQuery) {
    return (
      <div className="w-full h-full bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-sm text-gray-600">{loadError || 'Loading order…'}</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="w-full h-full bg-[#FAF7F0] flex items-center justify-center">
        <div className="text-sm text-gray-600">Returning to home…</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-[#FAF7F0]">
      <div className="max-w-md mx-auto p-4 pb-10">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="p-5">
            <div className="text-sm font-semibold text-gray-500">Order Confirmed</div>
            <div className="text-2xl font-extrabold text-gray-900 mt-1">You’re all set</div>

            <div className="mt-5 bg-[#FAF7F0] rounded-3xl p-5 text-center">
              <div className="text-xs font-semibold text-gray-500">Your Number</div>
              <div className="text-5xl font-extrabold tracking-tight text-gray-900 mt-2">
                #{orderNumber}
              </div>
              <div className="text-sm text-gray-600 mt-2">
                Estimated prep time: <span className="font-semibold text-gray-900">~{eta} min</span>
              </div>
            </div>

            <div className="mt-5">
              <div className="text-sm font-extrabold text-gray-900">Order Summary</div>
              {items.length === 0 ? (
                <div className="mt-2 text-sm text-gray-600">Summary unavailable.</div>
              ) : (
                <div className="mt-3 space-y-3">
                  {items.map((it, idx) => (
                    <div key={idx} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm font-semibold text-gray-900">
                          {it.quantity}x {it.name || 'Item'}
                        </div>
                      </div>
                      {it.remark && String(it.remark).trim() !== '' ? (
                        <div className="mt-1 text-sm text-gray-600">
                          <span className="text-gray-500">Remark:</span> {String(it.remark)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-gray-900">Order Notifications</div>
              <div className="text-sm text-gray-600 mt-1">
                Get a notification when your order is ready.
              </div>
              {pushError ? <div className="text-sm text-red-600 mt-2">{pushError}</div> : null}
              <button
                onClick={enableNotification}
                disabled={pushBusy || pushUiState !== 'available'}
                className="mt-4 w-full bg-black text-white rounded-2xl py-3 font-semibold shadow-md active:scale-[0.99] transition disabled:opacity-60"
              >
                {pushUiState === 'enabled'
                  ? 'Notifications Enabled'
                  : pushUiState === 'blocked'
                    ? 'Notifications Blocked'
                    : pushUiState === 'not_supported'
                      ? 'Not Supported'
                      : pushBusy
                        ? 'Enabling…'
                        : pushUiState === 'checking'
                          ? 'Checking…'
                          : 'Enable Notifications'}
              </button>
            </div>

            <div className="mt-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="text-sm font-extrabold text-gray-900">Sound Alert</div>
              <div className="text-sm text-gray-600 mt-1">
                Play a sound when your order becomes ready.
              </div>
              <button
                onClick={toggleSound}
                className={`mt-4 w-full rounded-2xl py-3 font-semibold shadow-md active:scale-[0.99] transition ${
                  soundEnabled ? 'bg-yellow-500 text-black' : 'bg-white border border-gray-200 text-gray-900'
                }`}
              >
                {soundEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <button
              onClick={() => {
                if (eventSlug) {
                  navigate(`/customer/event/${eventSlug}`);
                } else {
                  navigate('/', { replace: true });
                }
              }}
              className="mt-5 w-full bg-black text-white rounded-2xl py-4 text-base font-semibold shadow-xl active:scale-[0.99] transition"
            >
              Back to Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
