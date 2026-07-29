import { getMalaysiaDayRange, getMalaysiaTodayString } from '../utils/date';

export interface CupLimitDecision {
  enabled: boolean;
  target: number;
  usedQuantity: number;
  requestedQuantity: number;
  projectedQuantity: number;
  remainingQuantity: number;
  alreadyReached: boolean;
  wouldExceed: boolean;
  reachesTarget: boolean;
  canAccept: boolean;
}

export type EffectiveOrderingStatus = 'OPEN' | 'MANUALLY_CLOSED' | 'LIMIT_REACHED';

export function currentMalaysiaDayRange(now: Date | string | number = new Date()) {
  const date = getMalaysiaTodayString(now);
  return { date, ...getMalaysiaDayRange(date) };
}

export function dailyCupUsageWhere(eventId: string, now: Date | string | number = new Date()) {
  const { start, end } = currentMalaysiaDayRange(now);
  return {
    order: {
      eventId,
      createdAt: { gte: start, lt: end },
    },
  };
}

export function effectiveOrderingStatus(input: {
  storedStatus: EffectiveOrderingStatus;
  limitEnabled: boolean;
  limitQuantity: number;
  usedQuantity: number;
}): EffectiveOrderingStatus {
  if (input.storedStatus === 'MANUALLY_CLOSED') return 'MANUALLY_CLOSED';
  const limit = Math.max(0, Number(input.limitQuantity) || 0);
  const used = Math.max(0, Number(input.usedQuantity) || 0);
  if (input.limitEnabled === true && limit > 0 && used >= limit) return 'LIMIT_REACHED';
  return 'OPEN';
}

export function sumDrinkQuantities(items: ReadonlyArray<{ quantity: number }>) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

export function evaluateCupLimit(input: {
  enabled: boolean;
  target: number;
  usedQuantity: number;
  requestedQuantity: number;
}): CupLimitDecision {
  const target = Math.max(0, Number(input.target) || 0);
  const usedQuantity = Math.max(0, Number(input.usedQuantity) || 0);
  const requestedQuantity = Math.max(0, Number(input.requestedQuantity) || 0);
  const projectedQuantity = usedQuantity + requestedQuantity;
  const enabled = input.enabled === true && target > 0;

  if (!enabled) {
    return {
      enabled,
      target,
      usedQuantity,
      requestedQuantity,
      projectedQuantity,
      remainingQuantity: 0,
      alreadyReached: false,
      wouldExceed: false,
      reachesTarget: false,
      canAccept: true,
    };
  }

  const alreadyReached = usedQuantity >= target;
  const wouldExceed = !alreadyReached && projectedQuantity > target;
  const reachesTarget = !alreadyReached && projectedQuantity === target;

  return {
    enabled,
    target,
    usedQuantity,
    requestedQuantity,
    projectedQuantity,
    remainingQuantity: Math.max(0, target - usedQuantity),
    alreadyReached,
    wouldExceed,
    reachesTarget,
    canAccept: !alreadyReached && !wouldExceed,
  };
}
