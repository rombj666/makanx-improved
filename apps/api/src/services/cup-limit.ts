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
