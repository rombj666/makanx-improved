import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { enableSound, primeReadySound } from '../../lib/alerts';

interface OrderState {
  orderId?: string;
  orderNumber?: string;
  eta?: number;
  eventSlug?: string;
}

export function OrderConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const order = (location.state || null) as OrderState | null;

  if (!order) {
    navigate('/');
    return null;
  }

  const orderNumber = order.orderNumber || 'Unknown';
  const eta = order.eta ?? 5;

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

  const pushEnabled =
    typeof window !== 'undefined' ? localStorage.getItem('pushEnabled') : null;
  const pushEnabledTime =
    typeof window !== 'undefined' ? localStorage.getItem('pushEnabledTime') : null;
  const oneDay = 24 * 60 * 60 * 1000;
  const shouldAsk =
    !pushEnabled || Date.now() - Number(pushEnabledTime) > oneDay;

  const enableNotification = async () => {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      try {
        localStorage.setItem('pushEnabled', 'true');
        localStorage.setItem('pushEnabledTime', String(Date.now()));
      } catch {}
      navigate(`/customer/event/${order.eventSlug}`);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="w-full h-full bg-white flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">Order Confirmed</h1>
        <p className="text-gray-600">Your Number</p>
        <div className="text-5xl font-extrabold tracking-tight">#{orderNumber}</div>
        <p className="text-gray-500">Estimated Time: ~{eta} minutes</p>
        {shouldAsk && (
          <div className="p-3 border rounded-lg text-sm">
            <div className="mb-2">Enable Order Notifications 🔔</div>
            <button
              onClick={enableNotification}
              className="px-3 py-2 rounded bg-black text-white"
            >
              Enable Notifications
            </button>
          </div>
        )}
        <div className="p-3 border rounded-lg text-sm">
          <div className="mb-2">Sound Alert</div>
          <button onClick={toggleSound} className="px-3 py-2 rounded border">
            {soundEnabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <button
          onClick={() => navigate(`/customer/event/${order.eventSlug}`)}
          className="mt-4 px-4 py-2 rounded-lg bg-black text-white"
        >
          Back to Map
        </button>
      </div>
    </div>
  );
}

