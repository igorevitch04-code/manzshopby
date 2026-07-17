/**
 * Заказы — Netlify Blobs + защита админ-действий
 *
 * GET  — публично (клиент/CRM читают)
 * POST { order }  — публично (новый заказ) + серверный пуш в Telegram
 * POST { orders } / { patch } — только с заголовком X-Admin-Secret
 *
 * Env:
 *   PUSH_BOT_TOKEN
 *   ADMIN_NOTIFY_CHAT_ID  (default группа Manz)
 *   ADMIN_NOTIFY_THREAD_ID (default 2)
 *   ADMIN_API_SECRET
 */
import { getStore, connectLambda } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function compact(o) {
  return {
    id: o.id,
    date: o.date || null,
    status: o.status || "Новый",
    fullName: String(o.fullName || "").slice(0, 80),
    phone: String(o.phone || "").slice(0, 40),
    address: String(o.address || "").slice(0, 160),
    finalTotal: Number(o.finalTotal) || 0,
    delivery: o.delivery || "courier",
    trackingNumber: o.trackingNumber || null,
    tgId: o.tgId || null,
    tgUsername: o.tgUsername || null,
    freeDelivery: !!o.freeDelivery,
    pendingCashback: Number(o.pendingCashback) || 0,
    cashbackCredited: !!o.cashbackCredited,
    askReview: !!o.askReview,
    reviewDone: !!o.reviewDone,
    utmSource: o.utmSource || null,
    usedBonus: Number(o.usedBonus) || 0,
    items: Array.isArray(o.items)
      ? o.items.slice(0, 10).map(function (i) {
          return {
            id: i.id,
            name: String(i.name || "").slice(0, 60),
            brand: String(i.brand || "").slice(0, 40),
            size: i.size || null,
            price: Number(i.price) || 0,
          };
        })
      : [],
  };
}

function isAdmin(eventOrHeaders) {
  var secret = (process.env.ADMIN_API_SECRET || "").trim();
  if (!secret) return false;
  var h = eventOrHeaders || {};
  var got = "";
  try {
    var keys = Object.keys(h);
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i]).toLowerCase() === "x-admin-secret") {
        got = h[keys[i]];
        break;
      }
    }
  } catch (e) {}
  return String(got || "") === secret;
}

async function readOrders(store) {
  try {
    var raw = await store.get("orders");
    if (!raw) return [];
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && Array.isArray(data.orders)) return data.orders;
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.error("[orders] read", e);
  }
  return [];
}

async function writeOrders(store, orders) {
  var payload = {
    orders: orders,
    updatedAt: new Date().toISOString(),
    v: 3,
  };
  await store.set("orders", JSON.stringify(payload));
  return payload;
}

async function sendPush(text) {
  var token = (
    process.env.PUSH_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    ""
  ).trim();
  if (!token) return { ok: false, error: "no_token" };
  var chatId = (process.env.ADMIN_NOTIFY_CHAT_ID || "-1004319683257").trim();
  var threadRaw = (process.env.ADMIN_NOTIFY_THREAD_ID || "2").trim();
  var threadId = threadRaw ? Number(threadRaw) : null;
  var payload = {
    chat_id: chatId,
    text: String(text).slice(0, 3500),
    disable_web_page_preview: true,
  };
  if (threadId && !isNaN(threadId)) payload.message_thread_id = threadId;
  try {
    var r = await fetch(
      "https://api.telegram.org/bot" + token + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    var data = await r.json().catch(function () {
      return {};
    });
    return data;
  } catch (e) {
    return { ok: false, error: String(e && e.message ? e.message : e) };
  }
}

function formatOrderPush(order) {
  var deliveryLabel =
    order.delivery === "europost" ? "Европочта" : "Курьер";
  var itemsShort = (order.items || [])
    .map(function (i) {
      return (
        (i.brand || "") +
        " " +
        (i.name || "") +
        (i.size ? " (" + i.size + ")" : "")
      ).trim();
    })
    .join(", ")
    .slice(0, 400);
  var tgPart = order.tgUsername
    ? "@" + order.tgUsername
    : order.tgId
      ? "id:" + order.tgId
      : "—";
  var utmPart = order.utmSource ? "\nРеклама: " + order.utmSource : "";
  return (
    "🛍 Новый заказ #" +
    order.id +
    "\nФИО: " +
    (order.fullName || "—") +
    "\nТел: " +
    (order.phone || "—") +
    "\nTG: " +
    tgPart +
    utmPart +
    "\nДоставка: " +
    deliveryLabel +
    "\nАдрес: " +
    String(order.address || "—").slice(0, 160) +
    "\nСумма: " +
    order.finalTotal +
    " BYN" +
    (Number(order.usedBonus) > 0
      ? " (бонусы " + order.usedBonus + ")"
      : "") +
    "\nТовар: " +
    (itemsShort || "—")
  );
}

async function handle(method, body, admin) {
  var store = getStore("orders");
  var existing = await readOrders(store);

  if (method === "GET") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        orders: existing,
        count: existing.length,
        storage: "netlify-blobs",
      }),
    };
  }

  if (method !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
    };
  }

  // --- новый заказ от клиента (публично) ---
  if (body && body.order && body.order.id != null) {
    var c = compact(body.order);
    var without = existing.filter(function (o) {
      return String(o.id) !== String(c.id);
    });
    var orders = [c].concat(without).slice(0, 100);
    orders.sort(function (a, b) {
      var da = a.date ? new Date(a.date).getTime() : 0;
      var db = b.date ? new Date(b.date).getTime() : 0;
      return db - da;
    });
    var payload = await writeOrders(store, orders);
    var push = await sendPush(formatOrderPush(c));
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        count: orders.length,
        pushed: true,
        notify: !!(push && push.ok),
        storage: "netlify-blobs",
        updatedAt: payload.updatedAt,
      }),
    };
  }

  // --- админ: полная замена / patch ---
  if (!admin) {
    return {
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: "unauthorized",
        message: "Admin secret required for this action",
      }),
    };
  }

  var nextOrders = existing;

  if (body && body.patch && body.patch.id != null) {
    var patch = body.patch;
    var map = {};
    existing.forEach(function (o) {
      map[String(o.id)] = o;
    });
    var cur = map[String(patch.id)] || { id: patch.id };
    map[String(patch.id)] = compact(Object.assign({}, cur, patch));
    nextOrders = Object.keys(map).map(function (k) {
      return map[k];
    });
  } else if (body && Array.isArray(body.orders)) {
    nextOrders = body.orders.map(compact);
  } else {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: "need order, orders, or patch",
      }),
    };
  }

  nextOrders.sort(function (a, b) {
    var da = a.date ? new Date(a.date).getTime() : 0;
    var db = b.date ? new Date(b.date).getTime() : 0;
    return db - da;
  });

  var saved = await writeOrders(store, nextOrders);
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify({
      ok: true,
      count: nextOrders.length,
      storage: "netlify-blobs",
      updatedAt: saved.updatedAt,
    }),
  };
}

export async function handler(event) {
  try {
    connectLambda(event);
  } catch (e) {}

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  var headers = event.headers || {};
  var admin = isAdmin(headers);
  var body = {};
  if (event.httpMethod === "POST") {
    try {
      body = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: "invalid_json" }),
      };
    }
  }

  try {
    return await handle(event.httpMethod, body, admin);
  } catch (e) {
    console.error("[orders]", e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
        orders: [],
      }),
    };
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }
  var headers = {};
  try {
    req.headers.forEach(function (v, k) {
      headers[k] = v;
    });
  } catch (e) {
    headers = req.headers || {};
  }
  var admin = isAdmin(headers);
  var body = {};
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }
  try {
    var res = await handle(req.method, body, admin);
    return new Response(res.body, {
      status: res.statusCode,
      headers: corsHeaders,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config = { path: "/api/orders" };
