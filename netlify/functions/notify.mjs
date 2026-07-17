/**
 * Серверная отправка пушей в Telegram (токен только на Netlify)
 * POST /api/notify  { text: "..." }
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  const BOT_TOKEN = (process.env.BOT_TOKEN || "").trim();
  const CHAT_ID = (
    process.env.ADMIN_NOTIFY_CHAT_ID ||
    "-1004319683257"
  ).trim();
  const THREAD_RAW = (
    process.env.ADMIN_NOTIFY_THREAD_ID ||
    "2"
  ).trim();
  const THREAD_ID = THREAD_RAW ? Number(THREAD_RAW) : null;

  if (!BOT_TOKEN) {
    return json(500, { ok: false, error: "BOT_TOKEN not set in Netlify Env" });
  }
  if (!CHAT_ID) {
    return json(500, { ok: false, error: "ADMIN_NOTIFY_CHAT_ID not set" });
  }

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    return json(400, { ok: false, error: "invalid_json" });
  }

  const text = String(body.text || "").slice(0, 3500);
  if (!text) {
    return json(400, { ok: false, error: "text required" });
  }

  try {
    const payload = {
      chat_id: CHAT_ID,
      text,
      disable_web_page_preview: true,
    };
    if (THREAD_ID && !isNaN(THREAD_ID)) {
      payload.message_thread_id = THREAD_ID;
    }

    const r = await fetch(
      "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      }
    );
    const data = await r.json().catch(() => ({}));
    if (data && data.ok) {
      return json(200, { ok: true });
    }
    return json(502, {
      ok: false,
      error: (data && data.description) || "telegram_error",
      telegram: data || null,
    });
  } catch (e) {
    return json(500, {
      ok: false,
      error: String(e && e.message ? e.message : e),
    });
  }
};

export const config = {
  path: "/api/notify",
};
