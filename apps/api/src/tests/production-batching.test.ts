import { describe, expect, it } from 'vitest';
import { allocateProductionBatchItems, productionRecipeSignature } from '../services/order.service';

describe('smart production batch planning', () => {
  it('normalizes option groups and choices by their stable IDs', () => {
    const left = productionRecipeSignature('coffee', [
      { groupId: 'temperature', title: 'Temperature', choices: [{ id: 'cold', label: 'Cold' }, { id: 'extra', label: 'Extra' }] },
      { groupId: 'milk', title: 'Milk', choices: [{ id: 'oat', label: 'Oat' }] },
    ], 'less ice');
    const same = productionRecipeSignature('coffee', [
      { groupId: 'milk', title: 'Milk', choices: [{ id: 'oat', label: 'Oat' }] },
      { groupId: 'temperature', title: 'Temperature', choices: [{ id: 'extra', label: 'Extra' }, { id: 'cold', label: 'Cold' }] },
    ], 'less ice');
    expect(left).toBe(same);
    expect(productionRecipeSignature('coffee', [{ groupId: 'temperature', choices: [{ id: 'hot', label: 'Hot' }] }], 'less ice')).not.toBe(left);
    expect(productionRecipeSignature('coffee', [{ groupId: 'temperature', choices: [{ id: 'cold', label: 'Cold' }] }], 'no ice')).not.toBe(productionRecipeSignature('coffee', [{ groupId: 'temperature', choices: [{ id: 'cold', label: 'Cold' }] }], 'less ice'));
    expect(productionRecipeSignature('tea', [], '')).not.toBe(productionRecipeSignature('coffee', [], ''));
  });

  it('allocates whole items oldest-first without exceeding capacity or skipping an older item', () => {
    const items = (quantities: number[]) => quantities.map((quantity, index) => ({ id: `item-${index + 1}`, quantity }));
    expect(allocateProductionBatchItems(items([8, 3]), 10).map((item) => item.quantity)).toEqual([8]);
    expect(allocateProductionBatchItems(items([3, 2, 5]), 10).reduce((sum, item) => sum + item.quantity, 0)).toBe(10);
    expect(allocateProductionBatchItems(items([8, 3, 4]), 10).map((item) => item.quantity)).toEqual([8]);
    expect(allocateProductionBatchItems(items([12, 2]), 10)).toEqual([]);
    expect(allocateProductionBatchItems(items([12, 2]), 12).map((item) => item.quantity)).toEqual([12]);
  });
});
