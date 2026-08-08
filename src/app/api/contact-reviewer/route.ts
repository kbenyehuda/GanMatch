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

  const { targetId, reviewId, kind, messageText, senderEmail } = (payload ?? {}) as Record<
    string,
    unknown
  >;
  const effectiveTargetId = typeof targetId === "string" && targetId ? targetId : reviewId;
  const effectiveKind = kind === "place" ? "place" : "gan";
  if (typeof effectiveTargetId !== "string" || !effectiveTargetId) {
    return NextResponse.json({ error: "Missing targetId" }, { status: 400 });
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

  let reviewerUserId: string;
  let targetName = "GanMatch";
  let targetLine = "";

  if (effectiveKind === "place") {
    const { data: review, error: reviewErr } = await supabaseAdmin
      .from("place_reviews")
      .select("id,user_id,place_id,allow_contact")
      .eq("id", effectiveTargetId)
      .single();
    if (reviewErr || !review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.user_id === userData.user.id) {
      return NextResponse.json({ error: "Cannot contact yourself" }, { status: 400 });
    }
    if (review.allow_contact !== true) {
      return NextResponse.json({ error: "Contact not allowed for this review" }, { status: 403 });
    }

    const { data: place } = await supabaseAdmin
      .from("places")
      .select("name,address")
      .eq("id", review.place_id)
      .maybeSingle();

    reviewerUserId = review.user_id;
    targetName = place?.name ?? "GanMatch";
    targetLine = place?.address ?? "";

    await supabaseAdmin.from("place_review_contact_messages").insert({
      place_review_id: review.id,
      sender_user_id: userData.user.id,
      sender_email: senderEmail.trim(),
      message_text: messageText.trim(),
    });
  } else {
    const { data: review, error: reviewErr } = await supabaseAdmin
      .from("confirmed_reviews")
      .select("id,user_id,gan_id")
      .eq("id", effectiveTargetId)
      .single();
    if (reviewErr || !review) {
      return NextResponse.json({ error: "Review not found" }, { status: 404 });
    }
    if (review.user_id === userData.user.id) {
      return NextResponse.json({ error: "Cannot contact yourself" }, { status: 400 });
    }

    const { data: gan } = await supabaseAdmin
      .from("ganim_v2")
      .select("name_he,address,city")
      .eq("id", review.gan_id)
      .maybeSingle();

    reviewerUserId = review.user_id;
    targetName = gan?.name_he ?? "GanMatch";
    targetLine = [gan?.city, gan?.address].filter(Boolean).join(", ");

    await supabaseAdmin.from("review_contact_messages").insert({
      review_id: review.id,
      sender_user_id: userData.user.id,
      sender_email: senderEmail.trim(),
      message_text: messageText.trim(),
    });
  }

  const { data: reviewerData, error: reviewerErr } = await supabaseAdmin.auth.admin.getUserById(
    reviewerUserId
  );
  const reviewerEmail = reviewerData?.user?.email ?? null;
  if (reviewerErr || !reviewerEmail) {
    return NextResponse.json({ error: "Reviewer email unavailable" }, { status: 500 });
  }

  const resend = new Resend(cfg.resendApiKey);
  const subject = `הודעה על ההמלצה שלך ב-GanMatch (${targetName})`;
  const replyNotice =
    "לתשומת ליבך: אם תשיבו למייל זה, כתובת האימייל שלכם תיחשף לשולח ההודעה הזה בלבד — לא תפורסם ולא תישלח לאף אחד אחר.";
  const text = `מישהו שלח לך הודעה דרך GanMatch לגבי ההמלצה שפרסמת על: ${targetName}\n${
    targetLine ? `\n${targetLine}\n` : "\n"
  }\nההודעה:\n${messageText.trim()}\n\nאפשר להשיב ישירות למייל הזה כדי לענות לשולח.\n\n${replyNotice}`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2>הודעה חדשה על ההמלצה שלך</h2>
      <p>מישהו שלח לך הודעה דרך GanMatch לגבי ההמלצה שפרסמת על:</p>
      <p><strong>${escapeHtml(targetName)}</strong></p>
      ${targetLine ? `<p style="color:#666">${escapeHtml(targetLine)}</p>` : ""}
      <hr />
      <p><strong>ההודעה:</strong></p>
      <pre style="white-space: pre-wrap; font-family: inherit;">${escapeHtml(
        messageText.trim()
      )}</pre>
      <hr />
      <p>אפשר להשיב ישירות למייל הזה כדי לענות לשולח.</p>
      <p style="color:#8A6D00; background:#FFF7E0; border-radius:6px; padding:8px 10px; font-size:13px;">${escapeHtml(
        replyNotice
      )}</p>
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
    console.error("[contact-reviewer] Resend send failed:", sendErr);
    const detail =
      process.env.NODE_ENV !== "production" && sendErr.message ? `: ${sendErr.message}` : "";
    return NextResponse.json({ error: `Failed to send email${detail}` }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}

