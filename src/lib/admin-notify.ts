import "server-only";
import { Resend } from "resend";
import { serverEnv } from "@/lib/env/server";

/**
 * Emails ADMIN_EMAILS about a request that needs approval. Every user change waits for an
 * admin for now, so every request sends one (user, 2026-10-30). Never throws: the request is
 * already saved, and a failed email must not fail it.
 */
export async function notifyAdmins(args: { subject: string; html: string }): Promise<void> {
  const { RESEND_API_KEY: key, RESEND_FROM_EMAIL: from, ADMIN_EMAILS } = serverEnv;
  const to = Array.from(ADMIN_EMAILS);
  if (!key || !from || to.length === 0) {
    console.error("[admin-notify] not sent: RESEND_API_KEY, RESEND_FROM_EMAIL or ADMIN_EMAILS missing");
    return;
  }
  try {
    const { error } = await new Resend(key).emails.send({
      from,
      to,
      subject: args.subject,
      html: `<div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.5;">${args.html}</div>`,
    });
    if (error) console.error("[admin-notify] email failed:", error);
  } catch (e) {
    console.error("[admin-notify] email threw:", e);
  }
}

export const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** "Open this request" + "all requests" links for an email. */
export function requestLinksHtml(origin: string, page: string, id: string): string {
  const one = `${origin}/admin/${page}?id=${encodeURIComponent(id)}`;
  const all = `${origin}/admin/${page}`;
  return `<p><a href="${one}" style="display:inline-block;background:#0A2B6B;color:#fff;padding:10px 16px;border-radius:10px;text-decoration:none;font-weight:bold">לפתיחת הבקשה</a></p>
    <p><a href="${all}">לכל הבקשות הממתינות</a></p>`;
}
