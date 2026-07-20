import ExcelJS from 'exceljs';
import { formatMalaysiaDateTime, formatMalaysiaTime } from '../utils/date';

function orderSalesAmount(order: any) {
  const itemTotal = order.items.reduce((sum: number, item: any) => sum + Number(item.price) * item.quantity, 0);
  return itemTotal || Number(order.totalAmount);
}

export async function generateVendorSalesExcel(
  businessName: string,
  date: string,
  orders: any[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sales Report');

  // 1. Column Configuration
  worksheet.columns = [
    { header: 'A', key: 'a', width: 20 },
    { header: 'B', key: 'b', width: 20 },
    { header: 'C', key: 'c', width: 15 },
    { header: 'D', key: 'd', width: 25 },
    { header: 'E', key: 'e', width: 45 },
    { header: 'F', key: 'f', width: 20 },
  ];

  // 2. Report Header
  const titleCell = worksheet.getCell('A1');
  titleCell.value = 'Vendor Sales Analytics Report';
  titleCell.font = { name: 'Arial', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  worksheet.mergeCells('A1:F2');

  // 3. Metadata Section
  worksheet.addRow([]);
  const metaStart = worksheet.lastRow!.number + 1;
  worksheet.addRow(['Vendor Name:', businessName || 'N/A']);
  worksheet.addRow(['Report Date:', date]);
  worksheet.addRow(['Generated At:', formatMalaysiaDateTime(new Date())]);
  
  for (let i = metaStart; i < metaStart + 3; i++) {
    worksheet.getCell(`A${i}`).font = { bold: true };
  }

  // 4. KPI Summary Section
  worksheet.addRow([]);
  worksheet.addRow(['KPI SUMMARY']).font = { bold: true, size: 14 };
  const kpiHeaderRow = worksheet.addRow(['Total Orders', 'Total Drinks', 'Total Revenue']);
  kpiHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  kpiHeaderRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF444444' } };
    c.alignment = { horizontal: 'center' };
  });

  const totalOrders = orders.length;
  const totalDrinks = orders.reduce((sum, o) => sum + o.items.reduce((s: number, it: any) => s + it.quantity, 0), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + orderSalesAmount(o), 0);

  const kpiValueRow = worksheet.addRow([
    totalOrders,
    totalDrinks,
    `RM ${totalRevenue.toFixed(2)}`
  ]);
  kpiValueRow.alignment = { horizontal: 'center' };
  kpiValueRow.font = { size: 12 };

  worksheet.addRow([]);

  // 5. Product Performance Table
  // Prepare product breakdown data
  const productBreakdown: Record<string, { productName: string; qtySold: number; revenue: number; optionBreakdown: Record<string, number> }> = {};
  
  orders.forEach(order => {
    order.items.forEach((item: any) => {
      const name = item.menuItem?.name || 'Unknown';
      if (!productBreakdown[name]) {
        productBreakdown[name] = { productName: name, qtySold: 0, revenue: 0, optionBreakdown: {} };
      }
      productBreakdown[name].qtySold += item.quantity;
      productBreakdown[name].revenue += Number(item.price) * item.quantity;

      if (item.selectedOptions && Array.isArray(item.selectedOptions)) {
        const optionString = item.selectedOptions
          .map((g: any) => {
            const choices = g.choices.map((c: any) => c.label).join(', ');
            return `${g.title}: ${choices}`;
          })
          .join(' | ') || 'No options';
        
        productBreakdown[name].optionBreakdown[optionString] = (productBreakdown[name].optionBreakdown[optionString] || 0) + item.quantity;
      }
    });
  });

  worksheet.addRow(['PRODUCT PERFORMANCE BREAKDOWN']).font = { bold: true, size: 14 };
  const prodHeader = worksheet.addRow(['Product', 'Options Breakdown', 'Quantity Sold', 'Revenue']);
  prodHeader.font = { bold: true };
  prodHeader.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    c.border = { bottom: { style: 'thin' }, top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  Object.values(productBreakdown).forEach(p => {
    const optionSummary = Object.entries(p.optionBreakdown)
      .map(([opt, qty]) => `• ${opt}: ${qty}`)
      .join('\n');
    
    const row = worksheet.addRow([
      p.productName,
      optionSummary,
      p.qtySold,
      p.revenue
    ]);
    row.getCell(2).alignment = { wrapText: true };
    row.getCell(3).alignment = { horizontal: 'right' };
    row.getCell(4).alignment = { horizontal: 'right' };
    row.getCell(4).numFmt = '"RM "#,##0.00';
  });

  // Total row for products
  const prodTotalRow = worksheet.addRow([
    'Total',
    '',
    totalDrinks,
    totalRevenue
  ]);
  prodTotalRow.font = { bold: true };
  prodTotalRow.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
    c.border = { top: { style: 'medium' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });
  prodTotalRow.getCell(3).alignment = { horizontal: 'right' };
  prodTotalRow.getCell(4).alignment = { horizontal: 'right' };
  prodTotalRow.getCell(4).numFmt = '"RM "#,##0.00';

  worksheet.addRow([]);

  // 6. Detailed Orders Table
  worksheet.addRow(['DETAILED ORDERS']).font = { bold: true, size: 14 };
  const orderHeader = worksheet.addRow(['Order #', 'Created Time (MYT)', 'Total Quantity', 'Items Summary', 'Remarks', 'Total Amount']);
  orderHeader.font = { bold: true };
  orderHeader.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } };
    c.border = { bottom: { style: 'thin' }, top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
  });

  orders.forEach(o => {
    const orderQty = o.items.reduce((s: number, it: any) => s + it.quantity, 0);
    const itemsSummary = o.items.map((it: any) => {
      const opts = it.selectedOptions?.map((g: any) => g.choices.map((c: any) => c.label).join(', ')).join(' | ');
      return `${it.quantity}x ${it.menuItem?.name}${opts ? ` (${opts})` : ''}`;
    }).join('\n');
    const remarks = o.items.map((it: any) => it.remark).filter(Boolean).join('\n');

    const row = worksheet.addRow([
      o.eventOrderNumber,
      formatMalaysiaTime(o.createdAt),
      orderQty,
      itemsSummary,
      remarks,
      orderSalesAmount(o)
    ]);
    row.getCell(4).alignment = { wrapText: true };
    row.getCell(5).alignment = { wrapText: true };
    row.getCell(6).alignment = { horizontal: 'right' };
    row.getCell(6).numFmt = '"RM "#,##0.00';
  });

  // Styling cleanups
  worksheet.views = [{ state: 'frozen', ySplit: 2 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function generateEventOrdersExcel(event: any, orders: any[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Smart QR Ordering System';
  const worksheet = workbook.addWorksheet('Event Orders');

  worksheet.columns = [
    { header: 'Event name', key: 'eventName', width: 28 },
    { header: 'Event date', key: 'eventDate', width: 14 },
    { header: 'Event location', key: 'location', width: 24 },
    { header: 'Event order number', key: 'eventOrderNumber', width: 19 },
    { header: 'Customer name', key: 'customerName', width: 22 },
    { header: 'Customer phone', key: 'customerPhone', width: 18 },
    { header: 'Customer email', key: 'customerEmail', width: 28 },
    { header: 'Ordered items', key: 'orderedItems', width: 48 },
    { header: 'Total cups', key: 'totalCups', width: 12 },
    { header: 'Total amount', key: 'totalAmount', width: 14 },
    { header: 'Payment status', key: 'paymentStatus', width: 16 },
    { header: 'Preparation status', key: 'preparationStatus', width: 34 },
    { header: 'Order status', key: 'orderStatus', width: 16 },
    { header: 'Created time', key: 'createdAt', width: 24 },
  ];

  for (const order of orders) {
    worksheet.addRow({
      eventName: event.eventName,
      eventDate: event.eventDate.toISOString().slice(0, 10),
      location: event.location || '',
      eventOrderNumber: order.eventOrderNumber,
      customerName: order.customerName || '',
      customerPhone: order.customerPhone || '',
      customerEmail: order.customerEmail || '',
      orderedItems: order.items.map((item: any) => `${item.quantity}x ${item.menuItem.name}`).join(' | '),
      totalCups: order.items.reduce((sum: number, item: any) => sum + item.quantity, 0),
      totalAmount: Number(order.totalAmount),
      paymentStatus: order.paymentStatus,
      preparationStatus: order.items.map((item: any) => `${item.menuItem.name}: ${item.status}`).join(' | '),
      orderStatus: order.status,
      createdAt: formatMalaysiaDateTime(order.createdAt),
    });
  }

  const header = worksheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF171717' } };
  header.alignment = { vertical: 'middle' };
  header.height = 24;
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  worksheet.autoFilter = { from: 'A1', to: 'N1' };
  worksheet.getColumn('totalAmount').numFmt = '"RM "#,##0.00';
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) row.alignment = { vertical: 'top', wrapText: true };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
