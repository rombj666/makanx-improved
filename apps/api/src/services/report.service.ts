import prisma from '../utils/prisma';
import { sendEmail } from './email/email.service';
import { generateVendorSalesExcel } from './excel.service';

function normalizeReportRecipients(vendor: { 
  reportRecipientEmail?: string | null; 
  reportRecipientEmails?: unknown; 
}): string[] { 
  const recipients: string[] = []; 

  if (Array.isArray(vendor.reportRecipientEmails)) { 
    for (const email of vendor.reportRecipientEmails) { 
      if (typeof email === "string" && email.trim()) { 
        recipients.push(email.trim()); 
      } 
    } 
  } 

  if (vendor.reportRecipientEmail && vendor.reportRecipientEmail.trim()) { 
    recipients.push(vendor.reportRecipientEmail.trim()); 
  } 

  return Array.from(new Set(recipients)); 
} 

export async function triggerDailyReport(vendorId: string, date: string, recipientEmails?: string | string[]) {
  try {
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: { user: true }
    });

    if (!vendor) throw new Error('Vendor not found');

    // Combine recipients
    let emails: string[] = normalizeReportRecipients(vendor);
    
    // 1. From argument
    if (recipientEmails) {
      if (Array.isArray(recipientEmails)) emails.push(...recipientEmails);
      else emails.push(recipientEmails);
    }
    
    // Deduplicate and filter
    emails = Array.from(new Set(emails.map(e => e.trim().toLowerCase()))).filter(Boolean);

    if (emails.length === 0) {
      console.warn(`[ReportService] No recipient emails found for vendor ${vendorId} (${vendor.businessName}). Skipping report.`);
      return;
    }

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
    const excelBuffer = await generateVendorSalesExcel(vendor.businessName, date, orders);
    
    const fileName = `daily-production-report-${vendor.businessName.toLowerCase().replace(/\s+/g, '-')}-${date}.xlsx`;

    await sendEmail({
      to: emails,
      subject: `Daily Production Report - ${vendor.businessName} - ${date}`,
      html: reportHtml,
      attachments: [
        {
          filename: fileName,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      ]
    });

    // Update report status in usage record
    try {
      await prisma.vendorDailyUsage.update({
        where: { vendorId_date: { vendorId, date } },
        data: {
          reportSentAt: new Date(),
          reportSentTo: emails.join(', ')
        }
      });
    } catch (e) {
      // If record doesn't exist, ignore (maybe no usage yet)
      console.warn(`[ReportService] Could not update usage record for ${vendorId} on ${date}:`, e);
    }

    console.log(`[ReportService] Daily report sent to ${emails.length} recipients for vendor ${vendorId} on ${date}`);
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
      <p>Hi,</p>
      <p>Attached is the daily production report for <strong>${businessName}</strong> on <strong>${date}</strong>.</p>
      
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

      <p>Regards,<br>MakanX / Hour Coffee System</p>
      
      <p style="margin-top: 40px; font-size: 12px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
        Generated by MakanX Ordering System
      </p>
    </div>
  `;

  return html;
}
