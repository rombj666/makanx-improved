import { describe, expect, it } from 'vitest';
import { applyLiveOrder, belongsInKitchen } from './liveOrders';

describe('Live Orders committed response handling', () => {
  it('moves a one-item order from Kitchen to Ready without fetching', () => {
    const initial = { id: 'one', status: 'PREPARING', items: [{ status: 'PREPARING' }] };
    const committed = { ...initial, status: 'READY', items: [{ status: 'READY' }] };
    expect(applyLiveOrder([initial], committed, 'kitchen')).toEqual([]);
    expect(applyLiveOrder([], committed, 'ready')).toEqual([committed]);
  });

  it('keeps partial progress visible and moves only after the final item', () => {
    const partial = { id: 'two', status: 'PREPARING', items: [{ status: 'READY' }, { status: 'PREPARING' }] };
    expect(applyLiveOrder([], partial, 'kitchen')).toEqual([partial]);
    expect(applyLiveOrder([], partial, 'ready')).toEqual([]);
    const final = { ...partial, status: 'READY', items: [{ status: 'READY' }, { status: 'READY' }] };
    expect(applyLiveOrder([partial], final, 'kitchen')).toEqual([]);
    expect(applyLiveOrder([], final, 'ready')).toEqual([final]);
    expect(applyLiveOrder([final], final, 'ready')).toEqual([final]);
  });

  it('excludes inconsistent all-ready orders from Kitchen', () => {
    expect(belongsInKitchen({ id: 'stale', status: 'PREPARING', items: [{ status: 'READY' }] })).toBe(false);
  });
});
