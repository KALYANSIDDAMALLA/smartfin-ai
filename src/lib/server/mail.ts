import "server-only";
import nodemailer from "nodemailer";

/** In-app email (verification codes) over SMTP. Configured by SMTP_PASS (+ optional SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_FROM). */
export const mailConfigured = () => !!process.env.SMTP_PASS && !!(process.env.SMTP_USER ?? "");

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const port = Number(process.env.SMTP_PORT ?? 465), user = process.env.SMTP_USER!;
  const t = nodemailer.createTransport({ host: process.env.SMTP_HOST ?? "smtp.gmail.com", port, secure: port === 465, auth: { user, pass: (process.env.SMTP_PASS ?? "").replace(/\s/g, "") } });
  await t.sendMail({ from: process.env.SMTP_FROM ?? `SmartFin AI <${user}>`, to, subject, text, html });
}

/** The verification email: a big 6-digit code plus a link (either one confirms the address). */
export const verificationEmail = (code: string, link?: string) => ({
  subject: `Your SmartFin AI verification code: ${code}`,
  text: `Your SmartFin AI verification code is ${code}. It expires in 10 minutes.${link ? `\n\nOr confirm with this link: ${link}` : ""}\n\nIf you didn't create an account, ignore this email.`,
  html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 8px">Verify your email</h2><p style="color:#555">Enter this code on the sign-up page:</p><p style="font-size:34px;letter-spacing:8px;font-weight:700;margin:12px 0;color:#4338ca">${code}</p><p style="color:#555;font-size:13px">It expires in 10 minutes.${link ? ` Or <a href="${link}">confirm with this link</a>.` : ""}</p><p style="color:#999;font-size:12px">If you didn't create an account, ignore this email.</p></div>`,
});

/** Password-reset email with a one-time link (valid for a short time). */
export const resetEmail = (link: string) => ({
  subject: "Reset your SmartFin AI password",
  text: `Use this link to choose a new password: ${link}\n\nIt works once and expires soon. If you didn't ask for this, ignore this email; your password stays the same.`,
  html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px"><h2 style="margin:0 0 8px">Reset your password</h2><p style="color:#555">Click the button to choose a new password. The link works once and expires soon.</p><p style="margin:20px 0"><a href="${link}" style="background:#4338ca;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Choose a new password</a></p><p style="color:#999;font-size:12px">If you didn't ask for this, ignore this email. Your password stays the same.</p></div>`,
});
