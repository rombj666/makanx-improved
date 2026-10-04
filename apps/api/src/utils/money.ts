import { Prisma } from '@prisma/client';

export type MoneyInput = Prisma.Decimal | string | number;

export function money(value: MoneyInput): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value));
}

export function sumMoney(values: MoneyInput[]): Prisma.Decimal {
  return values.reduce<Prisma.Decimal>((sum, value) => sum.add(money(value)), new Prisma.Decimal(0));
}

export function moneyNumber(value: MoneyInput): number {
  return money(value).toNumber();
}

export function calculateLineTotal(
  lines: Array<{ price: MoneyInput; quantity: number }>,
): Prisma.Decimal {
  return lines.reduce(
    (total, line) => total.add(money(line.price).mul(line.quantity)),
    new Prisma.Decimal(0),
  );
}
