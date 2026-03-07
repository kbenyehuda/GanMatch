import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { requireContactReviewerConfig } from "@/lib/env/server";

function isEmailLike(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function POST(req: Request) {
  const cfg = requireContactReviewerConfig();
  if (!cfg.enabled) return NextResponse.json({ error: "Contact feature disabled" }, { status: 403 });

  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reviewId, messageText, senderEmail } = (payload ?? {}) as Record<string, unknown>;
  if (typeof reviewId !== "string" || !reviewId) {
    return NextResponse.json({ error: "Missing reviewId" }, { status: 400 });
  }
  if (typeof messageText !== "string" || !messageText.trim()) {
    return NextResponse.json({ error: "Missing messageText" }, { status: 400 });
  }
  if (typeof senderEmail !== "string" || !senderEmail.trim()) {
    return NextResponse.json({ error: "Missing senderEmail" }, { status: 400 });
  }
  if (!isEmailLike(senderEmail.trim())) {
    return NextResponse.json({ error: "Invalid senderEmail" }, { status: 400 });
  }

  const supabaseUserClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const supabaseAdmin = createClient(cfg.supabaseUrl, cfg.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const { data: review, error: reviewErr } = await supabaseAdmin
    .from("confirmed_reviews")
    .select("id,user_id,gan_id")
    .eq("id", reviewId)
    .single();
  if (reviewErr || !review) {
    return NextResponse.json({ error: "Review not found" }, { status: 404 });
  }
  if (review.user_id === userData.user.id) {
    return NextResponse.json({ error: "Cannot contact yourself" }, { status: 400 });
  }

  const { data: reviewerData, error: reviewerErr } = await supabaseAdmin.auth.admin.getUserById(
    review.user_id
  );
  const reviewerEmail = reviewerData?.user?.email ?? null;
  if (reviewerErr || !reviewerEmail) {
    return NextResponse.json({ error: "Reviewer email unavailable" }, { status: 500 });
  }

  const { data: gan } = await supabaseAdmin
    .from("ganim_v2")
    .select("name_he,address,city")
    .eq("id", review.gan_id)
    .maybeSingle();

  // Log message (best-effort)
  await supabaseAdmin.from("review_contact_messages").insert({
    review_id: review.id,
    sender_user_id: userData.user.id,
    sender_email: senderEmail.trim(),
    message_text: messageText.trim(),
  });

  const ganName = gan?.name_he ?? "GanMatch";
  const ganLine = [gan?.city, gan?.address].filter(Boolean).join(", ");

  const resend = new Resend(cfg.resendApiKey);
  const subject = `הודעה על ההמלצה שלך ב-GanMatch (${ganName})`;
  const text = `מישהו שלח לך הודעה דרך GanMatch לגבי ההמלצה שפרסמת על: ${ganName}\n${
    ganLine ? `\n${ganLine}\n` : "\n"
  }\nההודעה:\n${messageText.trim()}\n\nאפשר להשיב ישירות למייל הזה כדי לענות לשולח.`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>הודעה חדשה על ההמלצה שלך</h2>
      <p>מישהו שלח לך הודעה דרך GanMatch לגבי ההמלצה שפרסמת על:</p>
      <p><strong>${escapeHtml(ganName)}</strong></p>
      ${ganLine ? `<p style="color:#666">${escapeHtml(ganLine)}</p>` : ""}
      <hr />
      <p><strong>ההודעה:</strong></p>
      <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(
        messageText.trim()
      )}</pre>
      <hr />
      <p>אפשר להשיב ישירות למייל הזה כדי לענות לשולח.</p>
      <p style="color:#666; font-size:12px;">נשלח דרך GanMatch. כתובת הממליץ לא נחשפה לשולח.</p>
    </div>
  `;

  const { error: sendErr } = await resend.emails.send({
    from: cfg.resendFrom,
    to: reviewerEmail,
    replyTo: senderEmail.trim(),
    subject,
    html,
    text,
  });

  if (sendErr) {
    return NextResponse.json({ error: "Failed to send email" }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

