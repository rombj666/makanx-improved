import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587'),
  secure: process.env.MAIL_SECURE === 'true',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify()
  .then(() => console.log("[mail] SMTP verified successfully"))
  .catch(err => console.error("[mail] SMTP verification failed:", err));

export const sendPasswordResetEmail = async (email: string, otp: string) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn('Mail credentials not set. OTP not sent via email. OTP is:', otp);
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
    const info = await transporter.sendMail({
      from: process.env.MAIL_FROM || '"MakanX" <noreply@makanx.com>',
      to: email,
      subject: 'MakanX Password Reset Code',
      html,
    });
    console.log("[mail] Email sent:", info.messageId);
    return info;
  } catch (err) {
    console.error("[mail] Email send failed:", err);
    throw err;
  }
};
