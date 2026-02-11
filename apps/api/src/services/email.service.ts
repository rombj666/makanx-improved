import { Resend } from 'resend';

// Initialize Resend with API Key from environment variables
const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetEmail = async (email: string, otp: string) => {
  if (!process.env.RESEND_API_KEY) {
    console.warn('RESEND_API_KEY not set. OTP not sent via email. OTP is:', otp);
    return;
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #F97316;">Reset Your Password</h2>
      <p>You requested a password reset for your MakanX account.</p>
      <p>Your One-Time Password (OTP) is:</p>
      <div style="background-color: #f3f4f6; padding: 15px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #1f2937;">${otp}</span>
      </div>
      <p>This code will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
  `;

  try {
    const data = await resend.emails.send({
      from: process.env.MAIL_FROM || 'MakanX <noreply@makanx.com>',
      to: email,
      subject: 'MakanX Password Reset Code',
      html,
    });

    if (data.error) {
      console.error("[mail] Resend API error:", data.error);
      throw new Error(data.error.message);
    }

    console.log("[mail] Email sent via Resend:", data.data?.id);
    return data;
  } catch (err) {
    console.error("[mail] Email send failed:", err);
    throw err;
  }
};
