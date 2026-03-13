import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enableSound, primeReadySound } from '../../lib/alerts';

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
  const order = (location.state || null) as OrderState | null;

  const orderNumber = order?.orderNumber || 'Unknown';
  const eta = order?.eta ?? 5;
  const eventSlug = order?.eventSlug || '';
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

  const [pushEnabledState, setPushEnabledState] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pushEnabled') === 'true';
  });
  const [pushEnabledTimeState, setPushEnabledTimeState] = useState(() => {
    if (typeof window === 'undefined') return 0;
    return Number(localStorage.getItem('pushEnabledTime') || 0);
  });

  const oneDay = 24 * 60 * 60 * 1000;
  const shouldAsk =
    !pushEnabledState || Date.now() - Number(pushEnabledTimeState) > oneDay;

  const enableNotification = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const now = Date.now();
      try {
        localStorage.setItem('pushEnabled', 'true');
        localStorage.setItem('pushEnabledTime', String(now));
      } catch {}
      setPushEnabledState(true);
      setPushEnabledTimeState(now);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (order) return;
    navigate('/', { replace: true });
  }, [navigate, order]);

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

            {shouldAsk ? (
              <div className="mt-5 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="text-sm font-extrabold text-gray-900">Enable Order Notifications</div>
                <div className="text-sm text-gray-600 mt-1">
                  Get a notification when your order is ready.
                </div>
                <button
                  onClick={enableNotification}
                  className="mt-4 w-full bg-black text-white rounded-2xl py-3 font-semibold shadow-md active:scale-[0.99] transition"
                >
                  Enable Notifications
                </button>
              </div>
            ) : null}

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
              onClick={() => navigate(`/customer/event/${eventSlug}`)}
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
