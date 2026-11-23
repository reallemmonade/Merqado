/**
 * Emails a feedback note (and its screenshot, shown inline) through Resend.
 * Off until RESEND_API_KEY is set. Without a verified domain Resend only delivers
 * from onboarding@resend.dev to the account's own address, which is FEEDBACK_EMAIL_TO.
 */
type Env = Record<string, string | undefined>;

export interface FeedbackEmail {
  note: string;
  photo: string | null;
  from: { name: string; email: string };
  firm: string;
  page: string | null;
  at: Date;
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function buildFeedbackEmail(f: FeedbackEmail, env: Env = process.env) {
  const to = env.FEEDBACK_EMAIL_TO?.trim() || "maxam@guava.ventures";
  const sender = env.FEEDBACK_EMAIL_FROM?.trim() || "Merqado <onboarding@resend.dev>";
  const photo = f.photo?.match(/^data:image\/(png|jpeg|webp|gif);base64,(.+)$/);
  const ext = photo?.[1] === "jpeg" ? "jpg" : photo?.[1];
  const first = f.note.split("\n")[0]!.slice(0, 60);
  const meta = [f.from.name, f.from.email, f.firm, f.page].filter(Boolean).map((s) => esc(s!)).join(" · ");
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:14px;color:#111c26">
<p style="white-space:pre-wrap;margin:0 0 12px">${esc(f.note)}</p>
${photo ? `<img src="cid:feedback-photo" alt="" style="max-width:100%;border:1px solid #dde3e9;border-radius:8px">` : ""}
<p style="color:#556372;font-size:12px;margin:12px 0 0">${meta} · ${f.at.toISOString().slice(0, 16).replace("T", " ")} UTC</p>
</div>`;
  return {
    from: sender,
    to: [to],
    reply_to: f.from.email.endsWith(".invalid") ? undefined : f.from.email,
    subject: `Feedback: ${first}`,
    html,
    text: `${f.note}\n\n${f.from.name} · ${f.from.email} · ${f.firm}${f.page ? ` · ${f.page}` : ""}`,
    attachments: photo
      ? [{ filename: `screenshot.${ext}`, content: photo[2], content_id: "feedback-photo" }]
      : undefined,
  };
}

/** Sends it; returns false (never throws) when email is off or Resend refuses. */
export async function sendFeedbackEmail(f: FeedbackEmail, env: Env = process.env): Promise<boolean> {
  const key = env.RESEND_API_KEY?.trim();
  if (!key) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildFeedbackEmail(f, env)),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) console.error("feedback email failed", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("feedback email failed", err);
    return false;
  }
}
