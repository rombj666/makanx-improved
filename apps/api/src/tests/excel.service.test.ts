import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { generateEventOrdersExcel } from '../services/excel.service';

describe('event Excel report', () => {
  it('contains production data without prices and normalizes drink temperatures', async () => {
    const buffer = await generateEventOrdersExcel({
      eventName: 'Hour Coffee Event',
      eventDate: new Date('2026-07-23T00:00:00.000Z'),
      location: 'Kuala Lumpur',
      status: 'COMPLETED',
    }, [
      {
        eventOrderNumber: 1,
        createdAt: new Date('2026-07-23T01:00:00.000Z'),
        status: 'READY',
        totalAmount: 99,
        items: [
          {
            quantity: 2,
            price: 12,
            status: 'READY',
            menuItem: { name: 'Cafe Latte' },
            selectedOptions: [
              { title: 'Choice', choices: [{ label: 'Option: Hot' }] },
              { title: 'Sugar Option', choices: [{ label: 'Sugar' }] },
            ],
          },
          {
            quantity: 3,
            price: 8,
            status: 'READY',
            menuItem: { name: 'Lemonade' },
            selectedOptions: [],
          },
        ],
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet('Event Report')!;
    const rows = worksheet.getRows(1, worksheet.rowCount)!;
    const allText = rows.flatMap((row) => (row.values as any[]).slice(1)).join(' | ');

    expect(allText).not.toMatch(/revenue|price|total amount|total sales/i);

    const temperatureSection = rows.findIndex((row) => row.getCell(1).value === 'HOT AND COLD DRINK SUMMARY');
    expect(temperatureSection).toBeGreaterThan(-1);
    expect(rows[temperatureSection + 2].values).toEqual([, 'Hot Drinks', 2]);
    expect(rows[temperatureSection + 3].values).toEqual([, 'Cold Drinks', 3]);
    expect(rows[temperatureSection + 4].values).toEqual([, 'Total Drinks', 5]);

    const breakdownSection = rows.findIndex((row) => row.getCell(1).value === 'PRODUCT AND OPTION BREAKDOWN');
    expect(rows[breakdownSection + 2].values).toEqual([, 'Cafe Latte', 'Hot', 'Sugar', '—', 2]);
    expect(rows[breakdownSection + 3].values).toEqual([, 'Lemonade', '—', '—', '—', 3]);
  });
});
