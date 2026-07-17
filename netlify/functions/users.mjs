import { getStore, connectLambda } from "@netlify/blobs";

export async function handler(event) {
  // Нужно для работы Blobs в Netlify Functions
  connectLambda(event);

  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const store = getStore("bot-users");
  let users = {};
  try {
    const raw = await store.get("users");
    if (raw) users = JSON.parse(raw);
  } catch (e) {}

  if (event.httpMethod === "GET") {
    const list = Object.values(users);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: list.length, users: list }),
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false }) };
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {}

  if (body.action === "register" && body.id) {
    const id = String(body.id);
    if (!users[id]) {
      users[id] = {
        id,
        username: body.username || "",
        first_name: body.first_name || "",
        last_name: body.last_name || "",
        ts: Date.now(),
      };
      await store.set("users", JSON.stringify(users));
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, count: Object.keys(users).length }),
    };
  }

  if (body.action === "broadcast" && body.text) {
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ ok: false, error: "BOT_TOKEN not set" }),
      };
    }
    const list = Object.values(users);
    let sent = 0;
    let failed = 0;
    for (const u of list) {
      try {
        const payload = { chat_id: u.id, text: body.text };
        const method = body.photo ? "sendPhoto" : "sendMessage";
        if (body.photo) {
          payload.photo = body.photo;
          payload.caption = body.text;
        }
        if (body.buttonText && body.buttonUrl) {
          payload.reply_markup = {
            inline_keyboard: [[{ text: body.buttonText, url: body.buttonUrl }]],
          };
        }
        const r = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        const data = await r.json();
        if (data.ok) sent++;
        else failed++;
      } catch (e) {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, sent, failed, total: list.length }),
    };
  }

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ ok: false, error: "unknown action" }),
  };
}
