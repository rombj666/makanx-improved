import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPasswordResetEmail(email: string, otp: string) {
  const from = process.env.MAIL_FROM || "MakanX <onboarding@resend.dev>";

  if (!process.env.RESEND_API_KEY) {
    console.warn("[resend] RESEND_API_KEY not set. OTP:", otp);
    return { ok: false, reason: "missing_resend_key" };
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #F97316;">Reset Your Password</h2>
      <p>Your One-Time Password (OTP) is:</p>
      <div style="background:#f3f4f6;padding:16px;text-align:center;border-radius:10px;margin:16px 0;">
        <span style="font-size:26px;font-weight:700;letter-spacing:6px;">${otp}</span>
      </div>
      <p>This code expires in 10 minutes.</p>
    </div>
  `;

  try {
    console.log("[resend] sending", { to: email, from });

    const result = await resend.emails.send({
      from,
      to: email,
      subject: "MakanX Password Reset Code",
      html,
    });

    // Resend returns either data or error
    if ((result as any).error) {
      console.error("[resend] API error:", (result as any).error);
      return { ok: false, reason: "resend_error", detail: (result as any).error };
    }

    console.log("[resend] sent ok id:", (result as any).data?.id);
    return { ok: true, id: (result as any).data?.id };
  } catch (err) {
    console.error("[resend] exception:", err);
    return { ok: false, reason: "exception", detail: err };
  }
}
