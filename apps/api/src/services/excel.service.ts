import ExcelJS from 'exceljs';
import { formatMalaysiaDateTime } from '../utils/date';

const EM_DASH = '—';
const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD4D4D4' } },
  left: { style: 'thin', color: { argb: 'FFD4D4D4' } },
  bottom: { style: 'thin', color: { argb: 'FFD4D4D4' } },
  right: { style: 'thin', color: { argb: 'FFD4D4D4' } },
};

interface NormalizedOptions {
  temperature: string;
  sugar: string;
  other: string;
}

function cleanChoice(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/^(?:choice|option|temperature|sugar(?: option)?):\s*/i, '')
    .trim();
}

function knownTemperature(value: unknown) {
  const cleaned = cleanChoice(value).toLowerCase();
  if (cleaned === 'hot') return 'Hot';
  if (cleaned === 'cold') return 'Cold';
  return null;
}

function normalizeOptions(item: any): NormalizedOptions {
  const groups = Array.isArray(item?.selectedOptions) ? item.selectedOptions : [];
  let temperature = EM_DASH;
  let sugar = EM_DASH;
  const other: string[] = [];

  for (const group of groups) {
    const title = String(typeof group === 'string' ? group : group?.title || '').trim();
    const titleLower = title.toLowerCase();
    const choices = Array.isArray(group?.choices)
      ? group.choices
          .map((choice: any) => cleanChoice(typeof choice === 'string' ? choice : choice?.label))
          .filter(Boolean)
      : [];
    const temperatureChoice = choices.map(knownTemperature).find(Boolean);
    const titleTemperature = knownTemperature(title);

    if (temperatureChoice || titleTemperature) {
      temperature = temperatureChoice || titleTemperature || EM_DASH;
      const remaining = choices.filter((choice: string) => !knownTemperature(choice));
      if (remaining.length > 0) other.push(...remaining);
      continue;
    }

    if (titleLower.includes('temperature') || titleLower === 'choice' || titleLower === 'option') {
      if (choices.length > 0) other.push(...choices);
      continue;
    }

    if (titleLower.includes('sugar') || choices.some((choice: string) => /^(?:no\s+)?sugar$/i.test(choice))) {
      sugar = choices.join(', ') || cleanChoice(title) || EM_DASH;
      continue;
    }

    if (choices.length > 0) {
      other.push(title ? `${title}: ${choices.join(', ')}` : choices.join(', '));
    }
  }

  return { temperature, sugar, other: other.join(' | ') || EM_DASH };
}

function styleSectionTitle(row: ExcelJS.Row) {
  row.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF111111' } };
  row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E7E7' } };
  row.height = 22;
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', horizontal: 'left' };
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF333333' } };
    cell.border = thinBorder;
  });
}

function styleDataRow(row: ExcelJS.Row, quantityColumns: number[] = []) {
  row.eachCell((cell, column) => {
    cell.border = thinBorder;
    cell.alignment = {
      vertical: 'top',
      horizontal: quantityColumns.includes(column) ? 'right' : 'left',
      wrapText: column === 4,
    };
  });
}

function addSection(worksheet: ExcelJS.Worksheet, title: string) {
  if (worksheet.rowCount > 1) worksheet.addRow([]);
  const row = worksheet.addRow([title]);
  styleSectionTitle(row);
}

export async function generateEventOrdersExcel(event: any, orders: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart QR Ordering System';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('Event Report', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  worksheet.columns = [
    { key: 'a', width: 27 },
    { key: 'b', width: 25 },
    { key: 'c', width: 22 },
    { key: 'd', width: 38 },
    { key: 'e', width: 14 },
    { key: 'f', width: 22 },
    { key: 'g', width: 18 },
  ];

  const title = worksheet.addRow(['Event Production Report']);
  title.height = 32;
  for (let column = 1; column <= 7; column += 1) {
    title.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  }
  title.getCell(1).font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };

  const productTotals = new Map<string, number>();
  const combinations = new Map<string, { product: string; options: NormalizedOptions; quantity: number }>();
  let totalCups = 0;
  let hotDrinks = 0;
  let coldDrinks = 0;

  for (const order of orders) {
    for (const item of order.items || []) {
      const product = String(item.menuItem?.name || 'Unknown product').trim();
      const quantity = Number(item.quantity || 0);
      const options = normalizeOptions(item);
      totalCups += quantity;
      productTotals.set(product, (productTotals.get(product) || 0) + quantity);

      if (options.temperature === 'Hot') hotDrinks += quantity;
      else coldDrinks += quantity;

      const key = JSON.stringify([product, options.temperature, options.sugar, options.other]);
      const existing = combinations.get(key);
      if (existing) existing.quantity += quantity;
      else combinations.set(key, { product, options, quantity });
    }
  }

  addSection(worksheet, 'EVENT INFORMATION');
  const information = [
    ['Event name', event.eventName || EM_DASH],
    ['Event date', event.eventDate instanceof Date ? event.eventDate.toISOString().slice(0, 10) : String(event.eventDate || '').slice(0, 10)],
    ['Location', event.location || EM_DASH],
    ['Status', event.status || EM_DASH],
  ];
  for (const values of information) {
    const row = worksheet.addRow(values);
    row.getCell(1).font = { bold: true };
    styleDataRow(row);
  }

  addSection(worksheet, 'EVENT SUMMARY');
  let row = worksheet.addRow(['Total Orders', 'Total Cups', 'Hot Drinks', 'Cold Drinks']);
  styleHeader(row);
  row = worksheet.addRow([orders.length, totalCups, hotDrinks, coldDrinks]);
  styleDataRow(row, [1, 2, 3, 4]);

  addSection(worksheet, 'HOT AND COLD DRINK SUMMARY');
  row = worksheet.addRow(['Drink Type', 'Total Cups']);
  styleHeader(row);
  for (const values of [
    ['Hot Drinks', hotDrinks],
    ['Cold Drinks', coldDrinks],
    ['Total Drinks', totalCups],
  ]) {
    row = worksheet.addRow(values);
    if (values[0] === 'Total Drinks') row.font = { bold: true };
    styleDataRow(row, [2]);
  }

  addSection(worksheet, 'PRODUCT TOTALS');
  row = worksheet.addRow(['Product', 'Total Quantity']);
  styleHeader(row);
  for (const [product, quantity] of Array.from(productTotals.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    row = worksheet.addRow([product, quantity]);
    styleDataRow(row, [2]);
  }

  addSection(worksheet, 'PRODUCT AND OPTION BREAKDOWN');
  row = worksheet.addRow(['Product', 'Temperature', 'Sugar Option', 'Other Option', 'Quantity']);
  styleHeader(row);
  const breakdownRows = Array.from(combinations.values()).sort((a, b) =>
    a.product.localeCompare(b.product)
      || a.options.temperature.localeCompare(b.options.temperature)
      || a.options.sugar.localeCompare(b.options.sugar)
      || a.options.other.localeCompare(b.options.other),
  );
  for (const entry of breakdownRows) {
    row = worksheet.addRow([
      entry.product,
      entry.options.temperature,
      entry.options.sugar,
      entry.options.other,
      entry.quantity,
    ]);
    styleDataRow(row, [5]);
  }

  addSection(worksheet, 'ORDER DETAILS');
  row = worksheet.addRow([
    'Event Order Number', 'Order Time (MYT)', 'Product', 'Options', 'Quantity',
    'Preparation Status', 'Order Status',
  ]);
  styleHeader(row);
  for (const order of [...orders].sort((a, b) => Number(a.eventOrderNumber) - Number(b.eventOrderNumber))) {
    for (const item of order.items || []) {
      const options = normalizeOptions(item);
      row = worksheet.addRow([
        `Order #${order.eventOrderNumber}`,
        formatMalaysiaDateTime(order.createdAt),
        item.menuItem?.name || 'Unknown product',
        `Temperature: ${options.temperature} | Sugar Option: ${options.sugar} | Other Option: ${options.other}`,
        Number(item.quantity || 0),
        item.status,
        order.status,
      ]);
      styleDataRow(row, [5]);
    }
  }

  worksheet.eachRow((worksheetRow) => {
    worksheetRow.font = { name: 'Arial', ...worksheetRow.font };
  });
  worksheet.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
