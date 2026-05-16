import prisma from '../utils/prisma';
import { sendEmail } from './email/email.service';
import { generateVendorSalesExcel } from './excel.service';
import { formatMalaysiaDateTime, getMalaysiaDayRange } from '../utils/date';

async function resolveCurrentVendorEventId(vendorId: string) {
  const now = new Date();
  const currentBooth = await prisma.booth.findFirst({
    where: {
      vendorId,
      event: {
        status: 'ACTIVE',
        startDate: { lte: now },
        endDate: { gte: now },
      },
    },
    select: { eventId: true },
  });
  if (currentBooth?.eventId) return currentBooth.eventId;

  const activeBooth = await prisma.booth.findFirst({
    where: { vendorId, event: { status: 'ACTIVE' } },
    select: { eventId: true },
  });
  return activeBooth?.eventId ?? null;
}

export async function getVendorDailySalesReport(vendorId: string, dateStr: string, eventId?: string | null) {
  const { start, end } = getMalaysiaDayRange(dateStr);
  const effectiveEventId = eventId === undefined ? await resolveCurrentVendorEventId(vendorId) : eventId;
  
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorId },
    select: { businessName: true }
  });
  
  if (!vendor) throw new Error('Vendor not found');

  const orders = await prisma.order.findMany({
    where: {
      vendorId,
      ...(effectiveEventId ? { eventId: effectiveEventId } : {}),
      createdAt: { gte: start, lte: end },
      status: { in: ['PREPARING', 'READY'] }
    },
    include: {
      items: {
        include: { menuItem: true }
      }
    },
    orderBy: { createdAt: 'asc' }
  });

  const totalOrders = orders.length;
  const totalDrinks = orders.reduce((sum, o) => sum + o.items.reduce((s: number, it: any) => s + it.quantity, 0), 0);
  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  // Product Performance logic (copied and adapted from analytics.controller.ts)
  const productBreakdown: Record<string, { 
    productName: string; 
    qtySold: number; 
    revenue: number; 
    price: number; 
    optionBreakdown: Record<string, number>;
    remarks: string[];
  }> = {};

  for (const o of orders) {
    for (const it of o.items) {
      const id = it.menuItemId;
      const unitPrice = Number(it.price);
      
      let optionsPriceDelta = 0;
      const selectedOptions = (it.selectedOptions as any) || [];
      let optionString = '';

      if (Array.isArray(selectedOptions)) {
        optionString = selectedOptions.map((g: any) => {
          const choices = g.choices.map((c: any) => c.label).join(', ');
          return `${g.title}: ${choices}`;
        }).join(' | ');

        selectedOptions.forEach((opt: any) => {
          if (Array.isArray(opt.choices)) {
            opt.choices.forEach((c: any) => {
              optionsPriceDelta += typeof c.priceDelta === 'number' ? c.priceDelta : 0;
            });
          }
        });
      }

      const totalItemRevenue = (unitPrice + optionsPriceDelta) * it.quantity;

      if (!productBreakdown[id]) {
        productBreakdown[id] = { 
          productName: it.menuItem?.name || 'Unknown', 
          qtySold: 0, 
          revenue: 0, 
          price: unitPrice,
          optionBreakdown: {},
          remarks: []
        };
      }
      productBreakdown[id].qtySold += it.quantity;
      productBreakdown[id].revenue += totalItemRevenue;
      
      if (optionString) {
        productBreakdown[id].optionBreakdown[optionString] = (productBreakdown[id].optionBreakdown[optionString] || 0) + it.quantity;
      }
      if (it.remark) {
        productBreakdown[id].remarks.push(it.remark);
      }
    }
  }

  return {
    vendorName: vendor.businessName,
    reportDate: dateStr,
    totalOrders,
    totalDrinks,
    totalRevenue,
    avgOrder,
    productPerformance: Object.values(productBreakdown),
    orders // Full orders for Excel generation
  };
}

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
    const { start, end } = getMalaysiaDayRange(date);
    
    console.log(`[ReportService] Triggering report for vendor ${vendorId} on ${date}`);
    console.log(`[ReportService] Range UTC: ${start.toISOString()} to ${end.toISOString()}`);

    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: vendorId },
      include: { user: true }
    });

    if (!vendor) throw new Error('Vendor not found');

    // Combine recipients
    let emails: string[] = normalizeReportRecipients(vendor);
    
    if (recipientEmails) {
      if (Array.isArray(recipientEmails)) emails.push(...recipientEmails);
      else emails.push(recipientEmails);
    }
    
    emails = Array.from(new Set(emails.map(e => e.trim().toLowerCase()))).filter(Boolean);

    if (emails.length === 0) {
      console.warn(`[ReportService] No recipient emails found for vendor ${vendorId}. Skipping report.`);
      return;
    }

    const reportData = await getVendorDailySalesReport(vendorId, date);
    
    console.log(`[ReportService] Data found: ${reportData.totalOrders} orders, ${reportData.totalDrinks} drinks`);

    const reportHtml = generateReportHtml(reportData);
    const excelBuffer = await generateVendorSalesExcel(reportData.vendorName, date, reportData.orders);
    
    const fileName = `daily-production-report-${reportData.vendorName.toLowerCase().replace(/\s+/g, '-')}-${date}.xlsx`;

    await sendEmail({
      to: emails,
      subject: `Daily Production Report - ${reportData.vendorName} - ${date}`,
      html: reportHtml,
      attachments: [
        {
          filename: fileName,
          content: excelBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
      ]
    });

    try {
      await prisma.vendorDailyUsage.updateMany({
        where: { vendorId, date },
        data: {
          reportSentAt: new Date(),
          reportSentTo: emails.join(', ')
        }
      });
    } catch (e) {
      console.warn(`[ReportService] Could not update usage record for ${vendorId} on ${date}:`, e);
    }

    console.log(`[ReportService] Daily report sent to ${emails.length} recipients for vendor ${vendorId}`);
  } catch (error) {
    console.error('[ReportService] Error generating daily report:', error);
    throw error;
  }
}

function generateReportHtml(data: any) {
  const { vendorName, reportDate, totalOrders, totalDrinks, totalRevenue } = data;
  const generatedAt = formatMalaysiaDateTime(new Date());

  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; color: #333;">
      <h1 style="color: #444; border-bottom: 2px solid #eee; padding-bottom: 10px;">Daily Production Report</h1>
      <p>Hi,</p>
      <p>Attached is the daily production report for <strong>${vendorName}</strong> on <strong>${reportDate}</strong>.</p>
      <p style="color: #666; font-size: 13px;">Generated At: <strong>${generatedAt}</strong></p>
      
      <div style="display: flex; gap: 20px; margin: 20px 0;">
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #eee;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px;">Total Orders</div>
          <div style="font-size: 24px; font-weight: bold;">${totalOrders}</div>
        </div>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #eee;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px;">Total Drinks</div>
          <div style="font-size: 24px; font-weight: bold;">${totalDrinks}</div>
        </div>
        <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; flex: 1; text-align: center; border: 1px solid #eee;">
          <div style="font-size: 12px; color: #666; text-transform: uppercase; margin-bottom: 5px;">Total Revenue</div>
          <div style="font-size: 24px; font-weight: bold;">RM ${totalRevenue.toFixed(2)}</div>
        </div>
      </div>

      <p>Regards,<br>MakanX / Hour Coffee System</p>
      
      <p style="margin-top: 40px; font-size: 11px; color: #999; text-align: center; border-top: 1px solid #eee; padding-top: 10px;">
        Generated by MakanX Ordering System
      </p>
    </div>
  `;

  return html;
}
