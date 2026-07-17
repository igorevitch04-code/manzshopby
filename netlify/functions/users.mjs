const { getStore } = require("@netlify/blobs");

exports.handler = async (event) => {
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

  // GET — список / счётчик (для CRM «База: N чел.»)
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

  // Регистрация из Mini App
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

  // Рассылка (если вызываете с фронта)
  if (body.action === "broadcast" && body.text) {
    const BOT_TOKEN = process.env.BOT_TOKEN; // задайте в Netlify → Env variables
    const list = Object.values(users);
    let sent = 0;
    for (const u of list) {
      try {
        const r = await fetch(
          `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: u.id, text: body.text }),
          }
        );
        const data = await r.json();
        if (data.ok) sent++;
      } catch (e) {}
      await new Promise((r) => setTimeout(r, 35)); // анти-флуд
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, sent, total: list.length }),
    };
  }

  return {
    statusCode: 400,
    headers,
    body: JSON.stringify({ ok: false, error: "unknown action" }),
  };
};
