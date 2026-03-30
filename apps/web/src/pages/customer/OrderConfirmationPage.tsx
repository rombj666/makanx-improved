import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Info } from 'lucide-react';
import { api } from '../../lib/api';
import { getOrCreateGuestId } from '../../lib/guest';
import { getExistingPushSubscription, subscribeToPush } from '../../lib/push';
import { useSocket } from '../../context/SocketContext';
import { computeDisplayEtaMinutesFromQuantity } from '../../lib/utils';
import OrderStatusStepper from '../../components/customer/OrderStatusStepper';

interface OrderState {
  orderId?: string;
  orderNumber?: string;
  eta?: number;
  eventSlug?: string;
  vendorId?: string;
  boothId?: string;
  status?: string;
  items?: { name: string; quantity: number; remark?: string; selectedOptions?: any[] }[];
}

export function OrderConfirmationPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const orderFromState = (location.state || null) as OrderState | null;

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const orderIdFromQuery = searchParams.get('orderId') || undefined;
  const eventSlugFromQuery = searchParams.get('eventSlug') || undefined;
  const boothIdFromQuery = searchParams.get('boothId') || undefined;

  const [resolvedOrder, setResolvedOrder] = useState<OrderState | null>(orderFromState);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<string | null>(orderFromState?.status || null);

  useEffect(() => {
    if (orderFromState) {
      setResolvedOrder((prev) => ({
        ...(prev || {}),
        ...(orderFromState || {}),
        boothId: orderFromState.boothId || boothIdFromQuery,
      }));
      if (orderFromState?.status) setLiveStatus(orderFromState.status);
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
          found?.queueNumber ??
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
              selectedOptions: Array.isArray(it?.selectedOptions) ? it.selectedOptions : [],
            }))
          : [];
        let boothId: string | undefined = boothIdFromQuery;
        const vendorId = String(found?.vendorId || '');
        const status = String(found?.status || '');
        const effectiveSlug = eventSlugFromQuery || '';
        if (!boothId && effectiveSlug && vendorId) {
          try {
            const ev = await api.get(`/events/${effectiveSlug}`);
            const booths: any[] = ev.data?.data?.booths || [];
            const booth = booths.find((b) => String(b?.vendor?.id || '') === vendorId) || null;
            boothId = booth?.id ? String(booth.id) : undefined;
          } catch {}
        }
        setResolvedOrder({
          orderId: String(found.id),
          orderNumber,
          eta: Math.max(Number(found?.estimatedMinutes ?? 5), 0),
          eventSlug: effectiveSlug,
          vendorId,
          boothId,
          status,
          items,
        });
        if (status) setLiveStatus(status);
        setLoadError(null);
      } catch (err: any) {
        setLoadError(err?.message || 'Failed to load order.');
        setResolvedOrder(null);
      }
    };
    run();
  }, [orderFromState, orderIdFromQuery, eventSlugFromQuery, boothIdFromQuery]);

  const order = resolvedOrder;
  const orderId = order?.orderId || orderIdFromQuery;
  const orderNumber = order?.orderNumber || (orderId ? orderId.slice(-4).toUpperCase() : 'Unknown');
  const items = useMemo(() => (Array.isArray(order?.items) ? order!.items! : []), [order]);
  const qty = items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity || 0)), 0);
  const computedEta = computeDisplayEtaMinutesFromQuantity(qty);
  const eta = Number.isFinite(computedEta) && computedEta > 0 ? computedEta : order?.eta ?? 5;
  const eventSlug = order?.eventSlug || eventSlugFromQuery || '';
  const vendorId = order?.vendorId || '';
  const boothId = order?.boothId || boothIdFromQuery || '';
  const status = (liveStatus || order?.status || 'PREPARING').toUpperCase();

  const [pushUiState, setPushUiState] = useState<
    'checking' | 'available' | 'enabled' | 'blocked' | 'not_supported'
  >('checking');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [notifSheetOpen, setNotifSheetOpen] = useState(false);
  const [notifDismissed, setNotifDismissed] = useState(false);
  const [pendingLeave, setPendingLeave] = useState<null | (() => void)>(null);
  const currentPathRef = useRef('');

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

  const hasActiveOrder = status === 'PREPARING' || status === 'READY';
  const shouldLeaveGuard =
    hasActiveOrder && pushUiState !== 'enabled' && pushUiState !== 'checking';
  const canEnableNotifications = pushUiState === 'available';

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
        setPushError('Browser notifications are blocked');
      } else if (result.status === 'not_supported') {
        setPushUiState('not_supported');
        setPushError('Browser does not support website notifications');
      } else if (result.status === 'dismissed') {
        setPushUiState('available');
        setPushError('Notification permission was dismissed');
      } else {
        setPushUiState('available');
        setPushError(result.error || 'Failed to enable notifications.');
      }
    } catch (err: any) {
      console.error(err);
      setPushError(err?.message || 'Failed to enable notifications.');
    }
    setPushBusy(false);
  };

  useEffect(() => {
    if (!orderId) return;
    try {
      const key = `mx_notif_dismissed_${orderId}`;
      setNotifDismissed(sessionStorage.getItem(key) === '1');
    } catch {}
  }, [orderId]);

  useEffect(() => {
    currentPathRef.current = `${location.pathname}${location.search}${location.hash || ''}`;
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (!hasActiveOrder) return;
    if (pushUiState !== 'available') return;
    if (notifDismissed) return;
    setNotifSheetOpen(true);
  }, [hasActiveOrder, notifDismissed, pushUiState]);

  useEffect(() => {
    if (pushUiState !== 'enabled') return;
    setNotifSheetOpen(false);
    setPendingLeave(null);
    setPushError(null);
  }, [pushUiState]);

  const requestLeave = (action: () => void) => {
    if (!shouldLeaveGuard) {
      action();
      return;
    }
    setPendingLeave(() => action);
    setNotifSheetOpen(true);
  };

  const continueWithoutNotifications = () => {
    setNotifSheetOpen(false);
    const action = pendingLeave;
    setPendingLeave(null);
    if (action) {
      action();
      return;
    }
    if (orderId) {
      try {
        const key = `mx_notif_dismissed_${orderId}`;
        sessionStorage.setItem(key, '1');
      } catch {}
    }
    setNotifDismissed(true);
  };

  useEffect(() => {
    if (!shouldLeaveGuard) return;
    if (typeof window === 'undefined') return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [shouldLeaveGuard]);

  useEffect(() => {
    if (!shouldLeaveGuard) return;
    if (typeof window === 'undefined') return;
    const onPop = () => {
      const attempted = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`;
      const current = currentPathRef.current || attempted;
      if (attempted === current) return;
      window.history.pushState(null, '', current);
      setPendingLeave(() => () => navigate(attempted, { replace: true }));
      setNotifSheetOpen(true);
    };
    window.history.pushState(null, '', currentPathRef.current || window.location.href);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [navigate, shouldLeaveGuard]);

  useEffect(() => {
    if (order || orderIdFromQuery) return;
    navigate('/', { replace: true });
  }, [navigate, order, orderIdFromQuery]);

  useEffect(() => {
    if (!socket) return;
    if (!orderId) return;

    const onUpdate = (updated: any) => {
      if (String(updated?.id || '') !== String(orderId)) return;
      if (updated?.status) setLiveStatus(String(updated.status));
      setResolvedOrder((prev) => ({
        ...(prev || {}),
        orderId: String(updated?.id || prev?.orderId || ''),
        vendorId: String(updated?.vendorId || prev?.vendorId || ''),
        status: String(updated?.status || prev?.status || ''),
      }));
    };

    socket.on('order_updated', onUpdate);
    return () => {
      socket.off('order_updated', onUpdate);
    };
  }, [orderId, socket]);

  useEffect(() => {
    if (!orderId) return;
    if (isConnected) return;
    if (!eventSlug) return;
    if (status === 'COMPLETED') return;
    const interval = setInterval(async () => {
      try {
        const guestId = getOrCreateGuestId();
        const { data } = await api.get('/orders/my-orders', { params: { guestId } });
        const list: any[] = Array.isArray(data?.data) ? data.data : [];
        const found = list.find((o) => String(o?.id || '') === String(orderId));
        if (!found?.status) return;
        setLiveStatus(String(found.status));
        setResolvedOrder((prev) => ({
          ...(prev || {}),
          vendorId: String(found?.vendorId || prev?.vendorId || ''),
          status: String(found?.status || prev?.status || ''),
        }));
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [eventSlug, isConnected, orderId, status]);

  if (!order && orderIdFromQuery) {
    return (
      <div className="w-full h-full bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">{loadError || 'Loading order…'}</div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="w-full h-full bg-neutral-50 flex items-center justify-center">
        <div className="text-sm text-neutral-600">Returning to home…</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-neutral-50 flex flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-md mx-auto p-4 pb-10">
          <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-neutral-100">
            <div className="p-5">
              <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Order Confirmed</div>
              <div className="text-2xl font-semibold text-black mt-2">You’re all set</div>

              <div className="mt-5 bg-neutral-50 rounded-3xl p-5 text-center border border-neutral-100">
                <div className="text-xs font-semibold text-neutral-500 tracking-wide uppercase">Your Number</div>
                <div className="text-5xl font-semibold tracking-tight text-black mt-2">#{orderNumber}</div>
              </div>

              <div className="mt-5 rounded-3xl border border-neutral-100 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-black">Order Progress</div>
                  <span
                    className={`inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold ${
                      status === 'READY'
                        ? 'bg-black text-white'
                        : status === 'COMPLETED'
                          ? 'bg-neutral-200 text-neutral-900'
                          : 'bg-white text-black border border-neutral-200'
                    }`}
                  >
                    {status}
                  </span>
                </div>

                <div className="mt-4">
                  <OrderStatusStepper status={status} />
                </div>

                {status === 'PREPARING' ? (
                  <div className="mt-4 text-sm text-neutral-700">
                    Estimated prep time:{' '}
                    <span className="font-semibold text-black">~{eta} min</span>
                  </div>
                ) : status === 'READY' ? (
                  <div className="mt-4 text-sm text-neutral-700">
                    <span className="font-semibold text-black">READY</span> — Please collect at the booth.
                  </div>
                ) : status === 'COMPLETED' ? (
                  <div className="mt-4 text-sm text-neutral-700">
                    <span className="font-semibold text-black">Completed</span> — Enjoy your order.
                  </div>
                ) : null}
              </div>

              {!hasActiveOrder || pushUiState === 'enabled' ? null : (
                <div className="mt-4 rounded-3xl border border-black bg-black text-white p-5 shadow-xl">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-white text-black">
                      <Info size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-extrabold tracking-wide uppercase">Don’t close this page</div>
                      <div className="mt-2 text-sm leading-snug text-white/90">
                        Notifications are not enabled. Keep this tab open so you don’t miss status updates.
                      </div>
                      {pushError ? <div className="mt-2 text-sm text-white/90">{pushError}</div> : null}
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={() => setNotifSheetOpen(true)}
                          className="px-4 py-3 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.99] transition"
                        >
                          Enable Notifications
                        </button>
                        <button
                          onClick={continueWithoutNotifications}
                          className="px-4 py-3 rounded-2xl border border-white/30 text-white text-sm font-semibold active:scale-[0.99] transition"
                        >
                          Not Now
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-5">
                <div className="text-sm font-semibold text-black">Order Summary</div>
                {items.length === 0 ? (
                  <div className="mt-2 text-sm text-neutral-600">Summary unavailable.</div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {items.map((it, idx) => (
                      <div key={idx} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="text-sm font-semibold text-black">
                            {it.quantity}x {it.name || 'Item'}
                          </div>
                        </div>
                        {Array.isArray(it.selectedOptions) && it.selectedOptions.length > 0 ? (
                          <div className="mt-1 text-xs text-neutral-600">
                            {it.selectedOptions
                              .map((s: any) => {
                                const title = String(s?.title || '');
                                const choices = Array.isArray(s?.choices) ? s.choices : [];
                                const labels = choices.map((c: any) => String(c?.label || '')).filter(Boolean);
                                if (!title || labels.length === 0) return '';
                                return `${title}: ${labels.join(', ')}`;
                              })
                              .filter(Boolean)
                              .join(' • ')}
                          </div>
                        ) : null}
                        {it.remark && String(it.remark).trim() !== '' ? (
                          <div className="mt-1 text-sm text-neutral-600">
                            <span className="text-neutral-500">Remark:</span> {String(it.remark)}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 space-y-3">
                <button
                  onClick={() => {
                    requestLeave(() => {
                      if (!eventSlug) {
                        navigate('/', { replace: true });
                        return;
                      }
                      if (boothId) {
                        navigate(`/customer/event/${eventSlug}/booth/${boothId}`);
                        return;
                      }
                      if (vendorId) {
                        navigate(`/customer/event/${eventSlug}/order/${vendorId}`);
                        return;
                      }
                      navigate(`/customer/event/${eventSlug}`);
                    });
                  }}
                  className="w-full rounded-2xl py-3 text-sm font-semibold shadow-md active:scale-[0.99] transition bg-white border border-neutral-200 text-black"
                >
                  Back to Menu
                </button>
                <button
                  onClick={() => {
                    requestLeave(() => {
                      if (!eventSlug || !vendorId) {
                        if (eventSlug) navigate(`/customer/event/${eventSlug}`);
                        else navigate('/', { replace: true });
                        return;
                      }
                      const q = boothId ? `?boothId=${encodeURIComponent(boothId)}` : '';
                      navigate(`/customer/event/${eventSlug}/order/${vendorId}/cart${q}`);
                    });
                  }}
                  className="w-full rounded-2xl py-3 text-sm font-semibold shadow-md active:scale-[0.99] transition bg-black text-white"
                >
                  View Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <NotificationPromptSheet
        open={notifSheetOpen}
        pushUiState={pushUiState}
        pushBusy={pushBusy}
        pushError={pushError}
        canEnable={canEnableNotifications}
        onEnable={enableNotification}
        onContinue={continueWithoutNotifications}
        onClose={() => setNotifSheetOpen(false)}
      />
    </div>
  );
}

function NotificationPromptSheet({
  open,
  pushUiState,
  pushBusy,
  pushError,
  canEnable,
  onEnable,
  onContinue,
  onClose,
}: {
  open: boolean;
  pushUiState: 'checking' | 'available' | 'enabled' | 'blocked' | 'not_supported';
  pushBusy: boolean;
  pushError: string | null;
  canEnable: boolean;
  onEnable: () => void;
  onContinue: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const title =
    pushUiState === 'blocked'
      ? 'Notifications Blocked'
      : pushUiState === 'not_supported'
        ? 'Notifications Not Supported'
        : 'Enable Notifications';
  const body =
    pushUiState === 'blocked'
      ? 'Browser notifications are blocked for this site. You can still keep this page open to see status updates.'
      : pushUiState === 'not_supported'
        ? 'This browser does not support website notifications. Keep this page open to see status updates.'
        : 'Enable notifications so you get a clear alert when your order is READY.';

  const sheet = (
    <div className="fixed inset-0 z-50 bg-black/60" onMouseDown={onClose} onTouchStart={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 bg-white rounded-t-3xl shadow-2xl border-t border-neutral-200"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 flex items-center justify-between">
          <div className="text-base font-semibold text-black truncate">{title}</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full border border-neutral-200 text-black bg-white active:scale-95 transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pb-5">
          <div className="rounded-3xl border border-neutral-200 bg-neutral-50 p-5">
            <div className="text-xs font-extrabold tracking-wide uppercase text-black">
              Important
            </div>
            <div className="mt-2 text-sm text-neutral-800 leading-snug">
              <span className="font-semibold text-black">{body}</span>
            </div>
            {pushError ? <div className="mt-3 text-sm text-red-600">{pushError}</div> : null}
          </div>

          <button
            onClick={onEnable}
            disabled={pushBusy || !canEnable}
            className="mt-4 w-full rounded-2xl py-4 text-sm font-semibold shadow-md active:scale-[0.99] transition disabled:opacity-60 bg-black text-white"
          >
            {pushBusy ? 'Enabling…' : canEnable ? 'Enable Notifications' : 'Enable Unavailable'}
          </button>

          <button
            onClick={onContinue}
            className="mt-3 w-full rounded-2xl py-4 text-sm font-semibold shadow-sm active:scale-[0.99] transition bg-white border border-neutral-200 text-black"
          >
            Continue without notifications
          </button>

          <div className="pt-[max(env(safe-area-inset-bottom),12px)]" />
        </div>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}
