import { useCallback, useEffect, useMemo, useState } from 'react';

export type CartLine = {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  remark: string;
  imageUrl: string;
  selectedOptions?: { groupId: string; choiceIds: string[]; title?: string; choiceLabels?: string[] }[];
  remarksEnabled?: boolean;
};

type CartState = {
  vendorId: string;
  vendorName: string;
  lines: CartLine[];
};

function storageKey(storeId: string, vendorId: string) {
  return `smart_qr_cart_${storeId}_${vendorId}`;
}

function safeParse<T>(val: string | null, fallback: T): T {
  if (!val) return fallback;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

function newId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as any).randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampQuantity(q: number) {
  if (!Number.isFinite(q)) return 1;
  return Math.max(0, Math.min(99, Math.floor(q)));
}

function normalizeRemarksEnabled(val: any) {
  return val !== false;
}

function normalizeSelectedOptions(input: CartLine['selectedOptions']): string {
  const list = Array.isArray(input) ? input : [];
  const normalized = list
    .map((s) => ({
      groupId: String((s as any)?.groupId || ''),
      choiceIds: Array.isArray((s as any)?.choiceIds) ? (s as any).choiceIds.map(String).filter(Boolean) : [],
    }))
    .filter((s) => s.groupId && s.choiceIds.length > 0)
    .map((s) => ({ ...s, choiceIds: Array.from(new Set(s.choiceIds)).sort() }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId));
  return JSON.stringify(normalized);
}

export function useCustomerCart(params: {
  storeId: string;
  vendorId: string;
  vendorName?: string;
  maxItems?: number;
}) {
  const { storeId, vendorId, vendorName = '', maxItems = 99 } = params;
  const cartLimit = Math.max(1, Math.floor(Number(maxItems) || 99));
  const key = useMemo(() => storageKey(storeId, vendorId), [storeId, vendorId]);

  const [state, setState] = useState<CartState>(() => ({
    vendorId,
    vendorName,
    lines: [],
  }));

  useEffect(() => {
    if (!storeId || !vendorId) return;
    const loaded = safeParse<CartState>(localStorage.getItem(key), {
      vendorId,
      vendorName,
      lines: [],
    });
    setState({
      vendorId,
      vendorName: loaded.vendorName || vendorName,
      lines: Array.isArray(loaded.lines)
        ? loaded.lines.map((l: any) => ({
            ...l,
            remarksEnabled: normalizeRemarksEnabled(l?.remarksEnabled),
          }))
        : [],
    });
  }, [key, storeId, vendorId, vendorName]);

  useEffect(() => {
    if (!storeId || !vendorId) return;
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }, [key, state, storeId, vendorId]);

  const addLine = useCallback(
    (input: Omit<CartLine, 'id'>) => {
      setState((prev) => {
        const normalizedRemark = (input.remark || '').trim();
        const currentTotal = prev.lines.reduce((sum, l) => sum + l.quantity, 0);
        const remaining = Math.max(0, cartLimit - currentTotal);
        const qty = Math.min(clampQuantity(input.quantity), remaining);
        if (qty <= 0) return prev;
        const sig = normalizeSelectedOptions(input.selectedOptions);
        const allowRemarks = normalizeRemarksEnabled((input as any).remarksEnabled);
        const idx = prev.lines.findIndex(
          (l) =>
            l.menuItemId === input.menuItemId &&
            (l.remark || '').trim() === normalizedRemark &&
            normalizeSelectedOptions(l.selectedOptions) === sig
        );
        const nextLines =
          idx >= 0
            ? prev.lines.map((l, i) =>
                i === idx ? { ...l, quantity: clampQuantity(l.quantity + qty) } : l
              )
            : prev.lines.concat({
                ...input,
                id: newId(),
                quantity: qty,
                remark: normalizedRemark,
                remarksEnabled: allowRemarks,
              });
        return {
          vendorId,
          vendorName: prev.vendorName || vendorName,
          lines: nextLines,
        };
      });
    },
    [vendorId, vendorName, cartLimit]
  );

  const updateQuantity = useCallback((id: string, quantity: number) => {
    setState((prev) => {
      const otherQuantity = prev.lines.reduce((sum, l) => (l.id === id ? sum : sum + l.quantity), 0);
      const maxForLine = Math.max(0, cartLimit - otherQuantity);
      const next = prev.lines
        .map((l) => (l.id === id ? { ...l, quantity: Math.min(clampQuantity(quantity), maxForLine) } : l))
        .filter((l) => l.quantity > 0);
      return { ...prev, lines: next };
    });
  }, [cartLimit]);

  const updateRemark = useCallback((id: string, remark: string) => {
    setState((prev) => {
      const next = prev.lines.map((l) => (l.id === id ? { ...l, remark } : l));
      return { ...prev, lines: next };
    });
  }, []);

  const removeLine = useCallback((id: string) => {
    setState((prev) => ({ ...prev, lines: prev.lines.filter((l) => l.id !== id) }));
  }, []);

  const clear = useCallback(() => {
    try {
      localStorage.removeItem(key);
    } catch {}
    setState((prev) => ({ ...prev, lines: [] }));
  }, [key]);

  const subtotal = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [state.lines]
  );
  const total = subtotal;
  const totalItems = useMemo(
    () => state.lines.reduce((sum, l) => sum + l.quantity, 0),
    [state.lines]
  );

  return {
    vendorId: state.vendorId,
    vendorName: state.vendorName,
    lines: state.lines,
    addLine,
    updateQuantity,
    updateRemark,
    removeLine,
    clear,
    subtotal,
    total,
    totalItems,
  };
}
