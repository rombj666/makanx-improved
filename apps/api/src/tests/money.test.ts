import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { calculateLineTotal, money, sumMoney } from '../utils/money';

describe('exact money calculations', () => {
  it('adds 0.10 and 0.20 exactly', () => {
    expect(sumMoney(['0.10', '0.20']).toFixed(2)).toBe('0.30');
  });

  it('multiplies quantities and sums multiple lines without Number arithmetic', () => {
    const total = calculateLineTotal([
      { price: new Prisma.Decimal('0.10'), quantity: 3 },
      { price: new Prisma.Decimal('1.25'), quantity: 2 },
      { price: money('0.20').add('0.10'), quantity: 4 },
    ]);
    expect(total.toFixed(2)).toBe('4.00');
  });
});
