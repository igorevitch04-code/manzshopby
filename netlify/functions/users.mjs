/**
 * База пользователей бота + рассылка
 * GET  /api/users           → { ok, count, users }
 * POST /api/users
 *   { action: "register", id, username, first_name, last_name }
 *   { action: "broadcast", text, photo, buttonText, buttonUrl }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const BOT_TOKEN = "7270716853:AAHXqrp795TyLgp3FKEEaRlRqOrVXp5x6bU"; // основной бот мини-аппа (рассылка)

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tgGetDesc() {
  try {
    const r = await fetch(
      "https://api.telegram.org/bot" + BOT_TOKEN + "/getMyShortDescription",
      { cache: "no-store" }
    );
    const data = await r.json();
    return (data && data.result && data.result.short_description) || "";
  } catch (e) {
    return "";
  }
}

async function tgSetDesc(text) {
  try {
    const body = "short_description=" + encodeURIComponent(String(text).slice(0, 120));
    const r = await fetch(
      "https://api.telegram.org/bot" + BOT_TOKEN + "/setMyShortDescription",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      }
    );
    const data = await r.json();
    return !!(data && data.ok);
  } catch (e) {
    return false;
  }
}

function parsePointers(desc) {
  const s = String(desc || "");
  const mz = s.match(/mz:([A-Za-z0-9_-]+)/);
  const ord = s.match(/ord:([A-Za-z0-9_-]+)/);
  const u = s.match(/u:([A-Za-z0-9_-]+)/);
  return {
    mz: mz ? mz[1] : null,
    ord: ord ? ord[1] : null,
    u: u ? u[1] : null,
  };
}

function buildDesc(ptr) {
  const parts = [];
  if (ptr.mz) parts.push("mz:" + ptr.mz);
  if (ptr.ord) parts.push("ord:" + ptr.ord);
  if (ptr.u) parts.push("u:" + ptr.u);
  return parts.join(";");
}

async function blobRead(id) {
  if (!id) return null;
  try {
    const r = await fetch("https://jsonblob.com/api/jsonBlob/" + id, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

async function blobWrite(id, payload) {
  const body = JSON.stringify(payload);
  if (id) {
    try {
      const r = await fetch("https://jsonblob.com/api/jsonBlob/" + id, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body,
      });
      if (r.ok || r.status === 200 || r.status === 201) return id;
    } catch (e) {}
  }
  try {
    const r = await fetch("https://jsonblob.com/api/jsonBlob", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body,
    });
    if (r.ok || r.status === 201) {
      const x =
        r.headers.get("X-jsonblob") ||
        r.headers.get("x-jsonblob") ||
        r.headers.get("X-Jsonblob");
      if (x) return String(x).trim();
      const loc = r.headers.get("Location") || r.headers.get("location") || "";
      const parts = loc.split("/").filter(Boolean);
      if (parts.length) return parts[parts.length - 1];
    }
  } catch (e) {}
  return null;
}

async function loadUsers() {
  const desc = await tgGetDesc();
  const ptr = parsePointers(desc);
  const data = ptr.u ? await blobRead(ptr.u) : null;
  const users =
    data && Array.isArray(data.users)
      ? data.users
      : Array.isArray(data)
        ? data
        : [];
  return { users, ptr, blobId: ptr.u };
}

async function saveUsers(users, ptr) {
  const payload = {
    users: users.slice(0, 5000),
    updatedAt: new Date().toISOString(),
  };
  const written = await blobWrite(ptr.u, payload);
  if (!written) return null;
  if (written !== ptr.u) {
    await tgSetDesc(buildDesc({ ...ptr, u: written }));
  }
  return written;
}

async function tgApi(method, body) {
  const r = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({ ok: false }));
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const { users } = await loadUsers();
      return json(200, {
        ok: true,
        count: users.length,
        users: users.map((u) => ({
          id: u.id,
          username: u.username || null,
          first_name: u.first_name || null,
        })),
      });
    }

    if (req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
        return json(400, { ok: false, error: "invalid_json" });
      }

      const action = body.action || "register";

      if (action === "register") {
        const id = body.id != null ? String(body.id) : "";
        if (!id || id === "guest" || !/^\d+$/.test(id)) {
          return json(400, { ok: false, error: "invalid_id" });
        }
        const { users, ptr } = await loadUsers();
        const existing = users.find((u) => String(u.id) === id);
        const entry = {
          id,
          username: (body.username || (existing && existing.username) || "").slice(0, 64),
          first_name: (body.first_name || (existing && existing.first_name) || "").slice(0, 64),
          last_name: (body.last_name || (existing && existing.last_name) || "").slice(0, 64),
          joinedAt: (existing && existing.joinedAt) || new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
        };
        const next = [entry, ...users.filter((u) => String(u.id) !== id)].slice(0, 5000);
        const written = await saveUsers(next, ptr);
        if (!written) {
          return json(500, { ok: false, error: "save_failed" });
        }
        return json(200, { ok: true, count: next.length, registered: true });
      }

      if (action === "broadcast") {
        const text = String(body.text || "").trim();
        const photo = String(body.photo || "").trim();
        const buttonText = String(body.buttonText || "").trim();
        const buttonUrl = String(body.buttonUrl || "").trim();

        if (!text && !photo) {
          return json(400, { ok: false, error: "empty_message" });
        }
        if (buttonText && !buttonUrl) {
          return json(400, { ok: false, error: "button_url_required" });
        }
        if (buttonUrl && !/^https?:\/\//i.test(buttonUrl) && !/^https:\/\/t\.me\//i.test(buttonUrl)) {
          // allow t.me and http(s)
          if (!/^https:\/\/t\.me\//i.test(buttonUrl) && !/^https?:\/\//i.test(buttonUrl)) {
            return json(400, { ok: false, error: "button_url_invalid" });
          }
        }

        const { users } = await loadUsers();
        if (!users.length) {
          return json(200, {
            ok: true,
            sent: 0,
            failed: 0,
            total: 0,
            hint: "База пуста. Пользователи появятся после открытия мини-аппа.",
          });
        }

        let reply_markup = undefined;
        if (buttonText && buttonUrl) {
          reply_markup = {
            inline_keyboard: [[{ text: buttonText.slice(0, 64), url: buttonUrl }]],
          };
        }

        let sent = 0;
        let failed = 0;
        const errors = [];

        // лимит на один вызов функции (таймаут Netlify)
        const list = users.slice(0, 80);

        for (const u of list) {
          const chatId = u.id;
          try {
            let res;
            if (photo && /^https?:\/\//i.test(photo)) {
              res = await tgApi("sendPhoto", {
                chat_id: chatId,
                photo,
                caption: text.slice(0, 1024) || undefined,
                parse_mode: "HTML",
                reply_markup,
              });
            } else {
              res = await tgApi("sendMessage", {
                chat_id: chatId,
                text: text.slice(0, 4000),
                parse_mode: "HTML",
                disable_web_page_preview: false,
                reply_markup,
              });
            }
            if (res && res.ok) sent += 1;
            else {
              failed += 1;
              if (errors.length < 5) {
                errors.push({
                  id: chatId,
                  description: (res && res.description) || "fail",
                });
              }
            }
          } catch (e) {
            failed += 1;
          }
          await sleep(40);
        }

        return json(200, {
          ok: true,
          sent,
          failed,
          total: users.length,
          processed: list.length,
          errors,
        });
      }

      return json(400, { ok: false, error: "unknown_action" });
    }

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[users]", e);
    return json(500, {
      ok: false,
      error: String(e && e.message ? e.message : e),
    });
  }
};

export const config = {
  path: "/api/users",
};
