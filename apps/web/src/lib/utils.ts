import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

export function computeEtaMinutes(totalItemQuantity: number) {
  const qty = Number.isFinite(totalItemQuantity) ? Math.max(0, totalItemQuantity) : 0;
  return 5 + qty * 1.2;
}

export function roundUpToNearest5Minutes(minutes: number) {
  const mins = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  return Math.ceil(mins / 5) * 5;
}

export function computeDisplayEtaMinutesFromQuantity(totalItemQuantity: number) {
  return roundUpToNearest5Minutes(computeEtaMinutes(totalItemQuantity));
}

export function extractExplicitDisplayNumber(order: any): string | null {
  const raw =
    order?.boothOrderNumber ??
    order?.queueNumber ??
    order?.displayNumber ??
    order?.orderNumber ??
    order?.sequence ??
    null;
  if (raw !== null && raw !== undefined && `${raw}`.trim() !== '') {
    return String(raw).toUpperCase();
  }
  return null;
}

export function computeDisplayNumber(order: any): string {
  const explicit = extractExplicitDisplayNumber(order);
  if (explicit) return explicit;
  const id = order?.id || order?.orderId || '';
  return id ? String(id).slice(-4).toUpperCase() : '----';
}
