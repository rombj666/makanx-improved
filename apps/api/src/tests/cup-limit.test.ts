import { describe, expect, it } from 'vitest';
import { evaluateCupLimit, sumDrinkQuantities } from '../services/cup-limit';

describe('cup target decisions', () => {
  it('keeps ordering open below the enabled target', () => {
    const result = evaluateCupLimit({
      enabled: true,
      target: 60,
      usedQuantity: 55,
      requestedQuantity: 4,
    });

    expect(result.canAccept).toBe(true);
    expect(result.reachesTarget).toBe(false);
    expect(result.projectedQuantity).toBe(59);
  });

  it('accepts the final whole order that reaches the target exactly', () => {
    const result = evaluateCupLimit({
      enabled: true,
      target: 60,
      usedQuantity: 58,
      requestedQuantity: 2,
    });

    expect(result.canAccept).toBe(true);
    expect(result.reachesTarget).toBe(true);
    expect(result.projectedQuantity).toBe(60);
  });

  it('rejects an entire order that would exceed the target', () => {
    const result = evaluateCupLimit({
      enabled: true,
      target: 60,
      usedQuantity: 58,
      requestedQuantity: 3,
    });

    expect(result.canAccept).toBe(false);
    expect(result.wouldExceed).toBe(true);
    expect(result.remainingQuantity).toBe(2);
  });

  it('rejects all later orders after accepted quantity reached the target', () => {
    const result = evaluateCupLimit({
      enabled: true,
      target: 60,
      usedQuantity: 60,
      requestedQuantity: 1,
    });

    expect(result.canAccept).toBe(false);
    expect(result.alreadyReached).toBe(true);
  });

  it('does not close ordering when the target is disabled', () => {
    const result = evaluateCupLimit({
      enabled: false,
      target: 60,
      usedQuantity: 60,
      requestedQuantity: 10,
    });

    expect(result.canAccept).toBe(true);
    expect(result.alreadyReached).toBe(false);
    expect(result.reachesTarget).toBe(false);
  });

  it('counts quantities from every product rather than counting orders or product types', () => {
    const requestedQuantity = sumDrinkQuantities([
      { quantity: 2 }, // Lemonade
      { quantity: 3 }, // Any other drink
    ]);

    expect(requestedQuantity).toBe(5);
  });
});
