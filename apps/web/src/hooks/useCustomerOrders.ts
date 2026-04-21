import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { getOrCreateGuestId } from '../lib/guest';
import { useSocket } from '../context/SocketContext';
import { playReadySound, vibrateReady } from '../lib/alerts';
import { toast } from 'react-hot-toast';
import { computeDisplayEtaMinutesFromQuantity, computeDisplayNumber, extractExplicitDisplayNumber } from '../lib/utils';

export type ActiveOrder = {
  orderId: string;
  vendorId: string;
  vendorName?: string;
  status: string;
  estimatedMinutes: number;
  createdAt: string;
  updatedAt: string;
  displayNumber: string;
  items?: { name: string; quantity: number; remark?: string }[];
};

function storageKey(slug: string) {
  return `mx_active_orders_${slug}`;
}

function safeParse<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useCustomerOrders(eventSlug: string | undefined) {
  const slug = eventSlug || '';
  const { socket, isConnected } = useSocket();
  const [orders, setOrders] = useState<ActiveOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [allowedVendorIds, setAllowedVendorIds] = useState<Set<string> | null>(null);

  const key = useMemo(() => storageKey(slug), [slug]);

  // Initial load from localStorage
  useEffect(() => {
    if (!slug) return;
    const saved = safeParse<ActiveOrder[]>(localStorage.getItem(key), []);
    setOrders(saved);
  }, [key, slug]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    const run = async () => {
      try {
        const { data } = await api.get(`/events/${slug}`);
        const booths: any[] = data?.data?.booths || [];
        const ids = new Set<string>();
        for (const b of booths) {
          const vid = b?.vendor?.id;
          if (vid) ids.add(String(vid));
        }
        if (!cancelled) setAllowedVendorIds(ids);
      } catch {
        if (!cancelled) setAllowedVendorIds(null);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const [isThrottled, setIsThrottled] = useState(false);
  const lastFetchRef = useRef(0);

  const fetchAndMerge = useCallback(async () => {
    if (!slug || isThrottled) return;
    
    const now = Date.now();
    if (now - lastFetchRef.current < 5000) return; // 5s throttle

    setIsLoading(true);
    lastFetchRef.current = now;

    try {
      const guestId = getOrCreateGuestId();
      const { data } = await api.get(`/orders/my-orders`, {
        params: { guestId },
      });
      const raw: any[] = Array.isArray(data?.data) ? data.data : [];
      const serverOrders =
        allowedVendorIds && allowedVendorIds.size > 0
          ? raw.filter((o: any) => allowedVendorIds.has(String(o?.vendorId || '')))
          : raw;
      const normalized: ActiveOrder[] = serverOrders.map((o: any) => {
        const items = Array.isArray(o.items)
          ? o.items.map((it: any) => ({
              name: it?.menuItem?.name || '',
              quantity: Number(it?.quantity ?? 0),
              remark: it?.remark || '',
            }))
          : undefined;
        const qty = Array.isArray(items) ? items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity || 0)), 0) : 0;
        const computedEta = qty > 0 ? computeDisplayEtaMinutesFromQuantity(qty) : 0;
        const serverEta = Math.max(Number(o.estimatedMinutes ?? 0), 0);
        return {
          orderId: o.id,
          vendorId: o.vendorId,
          vendorName: o.vendor?.businessName || '',
          status: o.status,
          estimatedMinutes: serverEta || computedEta,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt,
          displayNumber: computeDisplayNumber(o),
          items,
        };
      });
      setOrders(normalized);
      localStorage.setItem(key, JSON.stringify(normalized));
    } catch (err: any) {
      if (err.response?.status === 429) {
        setIsThrottled(true);
        setTimeout(() => setIsThrottled(false), 60000); // 1 min backoff on 429
      }
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoading(false);
    }
  }, [slug, isThrottled, allowedVendorIds, key]);

  useEffect(() => {
    fetchAndMerge();
  }, [fetchAndMerge]);

  useEffect(() => {
    if (!slug) return;
    if (orders.length === 0) return;
    
    // If socket is connected, we poll much less frequently (every 60s)
    // If socket is disconnected, we poll every 30s
    const intervalMs = isConnected ? 60000 : 30000;
    
    const interval = setInterval(() => {
      void fetchAndMerge();
    }, intervalMs);
    return () => clearInterval(interval);
  }, [fetchAndMerge, isConnected, orders.length, slug]);

  useEffect(() => {
    if (!slug) return;
    const onFocus = () => {
      void fetchAndMerge();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchAndMerge();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAndMerge, slug]);

  // Socket updates
  useEffect(() => {
    if (!socket) return;

    const onUpdate = (updated: any) => {
      const explicitDisplay = extractExplicitDisplayNumber(updated);
      const upd: Partial<ActiveOrder> = {
        orderId: updated.id,
        status: updated.status,
        updatedAt: updated.updatedAt,
        estimatedMinutes: Math.max(Number(updated.estimatedMinutes ?? 0), 0),
        vendorName: updated.vendor?.businessName || updated.vendorName,
        vendorId: updated.vendorId,
        ...(explicitDisplay ? { displayNumber: explicitDisplay } : {}),
      };
      setOrders((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((o) => o.orderId === upd.orderId);
        let becameReady = false;
        let displayNum =
          explicitDisplay || (idx >= 0 ? next[idx]?.displayNumber : null) || computeDisplayNumber(updated);
        if (idx >= 0) {
          const old = next[idx];
          const merged = { ...old, ...upd };
          if (old.status !== 'READY' && merged.status === 'READY') {
            becameReady = true;
            displayNum = merged.displayNumber;
          }
          next[idx] = merged;
        } else {
          if (upd.orderId && (upd.status === 'PREPARING' || upd.status === 'READY')) {
            const newEntry = {
              orderId: upd.orderId!,
              vendorId: upd.vendorId || '',
              vendorName: upd.vendorName || '',
              status: upd.status || 'PREPARING',
              estimatedMinutes: upd.estimatedMinutes ?? 0,
              createdAt: updated.createdAt || new Date().toISOString(),
              updatedAt: updated.updatedAt || new Date().toISOString(),
              displayNumber: displayNum,
            };
            if (newEntry.status === 'READY') {
              becameReady = true;
            }
            next.unshift(newEntry);
          }
        }
        localStorage.setItem(key, JSON.stringify(next));
        if (becameReady) {
          toast.success(`Order #${displayNum} is READY — come collect`);
          playReadySound();
          vibrateReady();
        }
        return next;
      });
    };

    socket.on('order_updated', onUpdate);
    return () => {
      socket.off('order_updated', onUpdate);
    };
  }, [socket, key]);

  const addOrUpdate = useCallback(
    (order: ActiveOrder) => {
      setOrders((prev) => {
        const next = prev.slice();
        const idx = next.findIndex((o) => o.orderId === order.orderId);
        const qty = Array.isArray(order.items)
          ? order.items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity || 0)), 0)
          : 0;
        const computedEta = qty > 0 ? computeDisplayEtaMinutesFromQuantity(qty) : 0;
        const nextOrder: ActiveOrder =
          computedEta > 0 ? { ...order, estimatedMinutes: computedEta } : order;

        const shouldRemove =
          order.status !== 'PREPARING' && order.status !== 'READY';

        if (shouldRemove) {
          if (idx >= 0) {
            next.splice(idx, 1);
          }
        } else {
          if (idx >= 0) {
            next[idx] = { ...next[idx], ...nextOrder };
          } else {
            next.unshift(nextOrder);
          }
        }
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  const remove = useCallback(
    (orderId: string) => {
      setOrders((prev) => {
        const next = prev.filter((o) => o.orderId !== orderId);
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
    [key]
  );

  const decrementEta = useCallback(() => {
    setOrders((prev) => {
      const next = prev.map((o) => ({
        ...o,
        estimatedMinutes: Math.max((o.estimatedMinutes ?? 0) - 1, 0),
      }));
      localStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  }, [key]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status === 'PREPARING' || o.status === 'READY');
  }, [orders]);

  return { orders: activeOrders, isLoading, addOrUpdate, remove, decrementEta };
}
