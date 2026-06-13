export function buildOrderReadyEmail({
  orderNumber,
  storeName,
  customerOrderPageUrl,
}: {
  orderNumber: string;
  storeName: string;
  customerOrderPageUrl?: string;
}) {
  const subject = `Hour Coffee — Order #${orderNumber} Ready`;
  const text = `Your order #${orderNumber} is ready for pickup at ${storeName}.`;
  let html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h1 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">Order Ready for Pickup</h1>
      <p style="margin: 0; font-size: 14px; line-height: 1.6;">
        Your order <strong>#${orderNumber}</strong> is ready for pickup at <strong>${storeName}</strong>.
      </p>
  `;

  if (customerOrderPageUrl) {
    html += `
      <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6;">
        <a href="${customerOrderPageUrl}" style="display: inline-block; padding: 10px 20px; background-color: #000000; color: #ffffff; text-decoration: none; border-radius: 8px;">
          View Your Order
        </a>
      </p>
    `;
  }

  html += `
    </div>
  `;

  return { subject, html: html.trim(), text };
}

export function buildPasswordResetEmail({ otp }: { otp: string }) {
  const subject = 'Smart QR Ordering System Password Reset Code';
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">Reset Your Password</h2>
      <p style="margin: 0; font-size: 14px; line-height: 1.6;">Your One-Time Password (OTP) is:</p>
      <div style="background:#f3f4f6;padding:16px;text-align:center;border-radius:10px;margin:16px 0;">
        <span style="font-size:26px;font-weight:700;letter-spacing:6px;">${otp}</span>
      </div>
      <p style="margin: 0; font-size: 14px; line-height: 1.6;">This code expires in 10 minutes.</p>
    </div>
  `.trim();
  const text = `Your One-Time Password (OTP) is: ${otp}. This code expires in 10 minutes.`;

  return { subject, html, text };
}

export function buildTestEmail() {
  const subject = 'Hour Coffee Test Email';
  const html = `
    <div style="font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; max-width: 640px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 12px; font-size: 22px; line-height: 1.2;">Test Email from Hour Coffee</h2>
      <p style="margin: 0; font-size: 14px; line-height: 1.6;">
        This is a test email sent from the Hour Coffee email service.
      </p>
      <p style="margin: 24px 0 0; font-size: 14px; line-height: 1.6;">
        If you received this, your email configuration is working correctly!
      </p>
    </div>
  `.trim();
  const text = 'This is a test email sent from the Hour Coffee email service. If you received this, your email configuration is working correctly!';

  return { subject, html, text };
}
