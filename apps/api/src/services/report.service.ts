import prisma from '../utils/prisma';
import { sendEmail } from './email/email.service';

export async function triggerDailyReport(vendorId: string, date: string, recipientEmail: string) {
  try {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: { user: true }
    });

    if (!vendor) throw new Error('Vendor not found');

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const orders = await prisma.order.findMany({
      where: {
        vendorId,
        createdAt: { gte: start, lte: end },
        status: 'READY'
      },
      include: {
        items: {
          include: { menuItem: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    const reportHtml = generateReportHtml(vendor.businessName, date, orders);
    
    await sendEmail({
      to: recipientEmail,
      subject: `Daily Production Report - ${vendor.businessName} - ${date}`,
      html: reportHtml
    });

    // Update report status in usage record
    await prisma.vendorDailyUsage.update({
      where: { vendorId_date: { vendorId, date } },
      data: {
        reportSentAt: new Date(),
        reportSentTo: recipientEmail
      }
    });

    console.log(`[ReportService] Daily report sent for vendor ${vendorId} on ${date}`);
  } catch (error) {
    console.error('[ReportService] Error generating daily report:', error);
    throw error;
  }
}

function generateReportHtml(businessName: string, date: string, orders: any[]) {
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const totalOrders = orders.length;
  const totalDrinks = orders.reduce((sum, o) => sum + o.items.reduce((s: number, it: any) => s + it.quantity, 0), 0);

  // Product Breakdown
  const productBreakdown: Record<string, { qty: number; revenue: number; options: Record<string, number> }> = {};
  
  orders.forEach(order => {
    order.items.forEach((item: any) => {
      const name = item.menuItem?.name || 'Unknown';
      if (!productBreakdown[name]) {
        productBreakdown[name] = { qty: 0, revenue: 0, options: {} };
      }
      productBreakdown[name].qty += item.quantity;
      productBreakdown[name].revenue += Number(item.price) * item.quantity;

      // Option Combination Breakdown
      if (item.selectedOptions && Array.isArray(item.selectedOptions)) {
        const optionString = item.selectedOptions
          .map((g: any) => {
            const choices = g.choices.map((c: any) => c.label).join(', ');
            return `${g.title}: ${choices}`;
          })
          .join(' | ') || 'No options';
        
        productBreakdown[name].options[optionString] = (productBreakdown[name].options[optionString] || 0) + item.quantity;
      }
    });
  });

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333;">
      <h1 style="color: #444; border-bottom: 2px solid #eee; padding-bottom: 10px;">Daily Production Report</h1>
      <p><strong>Vendor:</strong> ${businessName}</p>
      <p><strong>Date:</strong> ${date}</p>
      
      <div style="display: flex; gap: 20px; margin: 20px 0;">
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase;">Total Orders</div>
          <div style="font-size: 24px; font-weight: bold;">${totalOrders}</div>
        </div>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase;">Total Drinks</div>
          <div style="font-size: 24px; font-weight: bold;">${totalDrinks}</div>
        </div>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase;">Total Revenue</div>
          <div style="font-size: 24px; font-weight: bold;">RM ${totalRevenue.toFixed(2)}</div>
        </div>
      </div>

      <h2 style="font-size: 18px; margin-top: 30px; border-left: 4px solid #ff6b00; padding-left: 10px;">Product Breakdown</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
        <thead>
          <tr style="background: #eee; text-align: left;">
            <th style="padding: 10px; border: 1px solid #ddd;">Product</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Qty</th>
            <th style="padding: 10px; border: 1px solid #ddd;">Base Revenue</th>
          </tr>
        </thead>
        <tbody>
          ${Object.entries(productBreakdown).map(([name, data]) => `
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd;">
                <strong>${name}</strong>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                  ${Object.entries(data.options).map(([opt, qty]) => `• ${opt}: ${qty}`).join('<br>')}
                </div>
              </td>
              <td style="padding: 10px; border: 1px solid #ddd;">${data.qty}</td>
              <td style="padding: 10px; border: 1px solid #ddd;">RM ${data.revenue.toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <h2 style="font-size: 18px; margin-top: 30px; border-left: 4px solid #ff6b00; padding-left: 10px;">Detailed Order Rows</h2>
      <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px;">
        <thead>
          <tr style="background: #eee; text-align: left;">
            <th style="padding: 8px; border: 1px solid #ddd;">#</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Time</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Items</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Total</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(o => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${o.displayNumber}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">${new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              <td style="padding: 8px; border: 1px solid #ddd;">
                ${o.items.map((it: any) => `
                  <div>${it.quantity}x ${it.menuItem?.name} 
                    <span style="color: #666; font-size: 11px;">
                      (${it.selectedOptions?.map((g: any) => g.choices.map((c: any) => c.label).join(', ')).join(' | ') || ''})
                    </span>
                  </div>
                `).join('')}
              </td>
              <td style="padding: 8px; border: 1px solid #ddd;">RM ${Number(o.totalAmount).toFixed(2)}</td>
              <td style="padding: 8px; border: 1px solid #ddd; color: #d97706;">
                ${o.items.map((it: any) => it.remark ? `• ${it.remark}` : '').filter(Boolean).join('<br>')}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <p style="margin-top: 40px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
        Generated by MakanX Ordering System
      </p>
    </div>
  `;

  return html;
}
