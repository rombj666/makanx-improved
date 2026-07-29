import { describe, expect, it } from 'vitest';
import {
  currentMalaysiaDayRange,
  dailyCupUsageWhere,
  effectiveOrderingStatus,
  evaluateCupLimit,
  sumDrinkQuantities,
} from '../services/cup-limit';
import { ORDER_LIMIT_REACHED_MESSAGE } from '../services/event.service';
import { getMalaysiaTodayString } from '../utils/date';

describe('daily cup limit decisions', () => {
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

  it('uses the required customer-facing message for every limit rejection', () => {
    expect(ORDER_LIMIT_REACHED_MESSAGE).toBe(
      'Ordering is closed because the cup limit has been reached.',
    );
  });

  it('serializes concurrent decisions so a later order cannot exceed the limit', () => {
    const first = evaluateCupLimit({
      enabled: true,
      target: 100,
      usedQuantity: 98,
      requestedQuantity: 2,
    });
    expect(first.canAccept).toBe(true);

    // The event row lock makes the next transaction observe the first
    // transaction's committed projected quantity.
    const second = evaluateCupLimit({
      enabled: true,
      target: 100,
      usedQuantity: first.projectedQuantity,
      requestedQuantity: 1,
    });
    expect(second.canAccept).toBe(false);
    expect(second.alreadyReached).toBe(true);
  });
});

describe('Malaysia daily usage window', () => {
  it('changes calendar date at 12:00 AM Asia/Kuala_Lumpur', () => {
    expect(getMalaysiaTodayString('2026-07-29T15:59:59.999Z')).toBe('2026-07-29');
    expect(getMalaysiaTodayString('2026-07-29T16:00:00.000Z')).toBe('2026-07-30');
  });

  it('uses a half-open Malaysia-midnight range', () => {
    const range = currentMalaysiaDayRange('2026-07-29T16:30:00.000Z');
    expect(range.date).toBe('2026-07-30');
    expect(range.start.toISOString()).toBe('2026-07-29T16:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-07-30T16:00:00.000Z');
  });

  it('scopes progress to the active event and current Malaysia day', () => {
    const where = dailyCupUsageWhere('active-event', '2026-07-29T16:30:00.000Z');
    expect(where.order.eventId).toBe('active-event');
    expect(where.order.createdAt.gte.toISOString()).toBe('2026-07-29T16:00:00.000Z');
    expect(where.order.createdAt.lt.toISOString()).toBe('2026-07-30T16:00:00.000Z');
  });

  it('excludes previous-day orders and includes both day boundaries correctly', () => {
    const { start, end } = currentMalaysiaDayRange('2026-07-29T16:30:00.000Z');
    const belongsToToday = (createdAt: string) => {
      const value = new Date(createdAt);
      return value >= start && value < end;
    };
    expect(belongsToToday('2026-07-29T15:59:59.999Z')).toBe(false);
    expect(belongsToToday('2026-07-29T16:00:00.000Z')).toBe(true);
    expect(belongsToToday('2026-07-30T15:59:59.999Z')).toBe(true);
    expect(belongsToToday('2026-07-30T16:00:00.000Z')).toBe(false);
  });

  it('does not filter by order status, so ready and completed orders remain counted', () => {
    const where = dailyCupUsageWhere('active-event', '2026-07-29T16:30:00.000Z');
    expect(where.order).not.toHaveProperty('status');
    expect(where.order).not.toHaveProperty('completedAt');
  });
});

describe('daily ordering state', () => {
  it('reports LIMIT_REACHED without changing the active event status', () => {
    const event = { id: 'same-event', status: 'ACTIVE' as const, orderingStatus: 'OPEN' as const };
    const orderingStatus = effectiveOrderingStatus({
      storedStatus: event.orderingStatus,
      limitEnabled: true,
      limitQuantity: 100,
      usedQuantity: 100,
    });
    expect(orderingStatus).toBe('LIMIT_REACHED');
    expect(event.status).toBe('ACTIVE');
  });

  it('reopens the same active event on the next day when only the prior limit was reached', () => {
    const eventId = 'same-event';
    const orderingStatus = effectiveOrderingStatus({
      storedStatus: 'LIMIT_REACHED',
      limitEnabled: true,
      limitQuantity: 100,
      usedQuantity: 0,
    });
    expect(eventId).toBe('same-event');
    expect(orderingStatus).toBe('OPEN');
  });

  it('does not reopen a manually closed event after midnight', () => {
    expect(effectiveOrderingStatus({
      storedStatus: 'MANUALLY_CLOSED',
      limitEnabled: true,
      limitQuantity: 100,
      usedQuantity: 0,
    })).toBe('MANUALLY_CLOSED');
  });

  it('keeps ordering open when the daily limit is disabled', () => {
    expect(effectiveOrderingStatus({
      storedStatus: 'LIMIT_REACHED',
      limitEnabled: false,
      limitQuantity: 100,
      usedQuantity: 1000,
    })).toBe('OPEN');
  });

  it('keeps manual event completion separate from daily ordering state', () => {
    const event = { status: 'ACTIVE' as 'ACTIVE' | 'COMPLETED' };
    effectiveOrderingStatus({
      storedStatus: 'OPEN',
      limitEnabled: true,
      limitQuantity: 100,
      usedQuantity: 100,
    });
    expect(event.status).toBe('ACTIVE');

    event.status = 'COMPLETED';
    expect(event.status).toBe('COMPLETED');
  });
});
