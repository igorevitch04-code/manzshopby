/**
 * User state (корзина / избранное) — Netlify Blobs
 * Тот же паттерн, что catalog.mjs
 * Работает и как Functions 2.0 (/api/userstate), и как classic handler
 */
import { getStore, connectLambda } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function normalizeState(state) {
  var s = state && typeof state === "object" ? state : {};
  return {
    cart: Array.isArray(s.cart) ? s.cart : [],
    favorites: Array.isArray(s.favorites) ? s.favorites : [],
    bonusBalance: Number(s.bonusBalance) || 0,
    orderHistory: Array.isArray(s.orderHistory) ? s.orderHistory.slice(0, 40) : [],
    referralCount: Number(s.referralCount) || 0,
    referralEarnings: Number(s.referralEarnings) || 0,
    orders: Number(s.orders) || 0,
    updatedAt: s.updatedAt || new Date().toISOString(),
  };
}

async function readUser(store, userKey) {
  try {
    var raw = await store.get(userKey);
    if (!raw) return null;
    var data = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (data && typeof data === "object") return data;
  } catch (e) {
    console.error("[userstate] read", e);
  }
  return null;
}

async function handle(method, bodyObj) {
  var store = getStore("userstate");

  var action = String((bodyObj && bodyObj.action) || "get").toLowerCase();
  var id = String((bodyObj && bodyObj.id) || "").trim();

  // GET без body — пустой state
  if (method === "GET" && !id) {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ ok: true, state: null, storage: "netlify-blobs" }),
    };
  }

  if (!id || !/^\d+$/.test(id)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ ok: false, error: "invalid_id", got: id }),
    };
  }

  var userKey = "user_" + id;

  if (action === "get" || action === "getstate" || method === "GET") {
    var state = await readUser(store, userKey);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        state: state,
        storage: "netlify-blobs",
        source: "blobs",
      }),
    };
  }

  if (action === "set" || action === "setstate" || method === "POST") {
    var incoming = normalizeState(bodyObj && bodyObj.state);

    // Не откатываем более новое состояние
    var existing = await readUser(store, userKey);
    if (existing && existing.updatedAt && incoming.updatedAt) {
      var tOld = Date.parse(existing.updatedAt) || 0;
      var tNew = Date.parse(incoming.updatedAt) || 0;
      if (tOld && tNew && tNew < tOld) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({
            ok: true,
            skipped: true,
            reason: "older_than_existing",
            cart: (existing.cart || []).length,
            favorites: (existing.favorites || []).length,
            updatedAt: existing.updatedAt,
            storage: "netlify-blobs",
            source: "blobs",
          }),
        };
      }
    }

    await store.set(userKey, JSON.stringify(incoming));

    // verify
    var verify = await readUser(store, userKey);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        cart: incoming.cart.length,
        favorites: incoming.favorites.length,
        updatedAt: incoming.updatedAt,
        verified: !!(verify && verify.updatedAt),
        storage: "netlify-blobs",
        source: "blobs",
      }),
    };
  }

  return {
    statusCode: 400,
    headers: corsHeaders,
    body: JSON.stringify({ ok: false, error: "unknown_action", action: action }),
  };
}

// Classic Netlify Function
export async function handler(event) {
  try {
    connectLambda(event);
  } catch (e) {}

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  var bodyObj = {};
  if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
    try {
      bodyObj = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: "invalid_json" }),
      };
    }
  } else if (event.httpMethod === "GET") {
    var qs = event.queryStringParameters || {};
    bodyObj = { action: qs.action || "get", id: qs.id || "" };
  }

  try {
    return await handle(event.httpMethod, bodyObj);
  } catch (e) {
    console.error("[userstate] handler", e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
      }),
    };
  }
}

// Functions 2.0 /api/userstate
export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  var bodyObj = {};
  if (req.method === "POST" || req.method === "PUT") {
    try {
      bodyObj = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  } else if (req.method === "GET") {
    try {
      var u = new URL(req.url);
      bodyObj = {
        action: u.searchParams.get("action") || "get",
        id: u.searchParams.get("id") || "",
      };
    } catch (e) {}
  }

  try {
    var res = await handle(req.method, bodyObj);
    return new Response(res.body, { status: res.statusCode, headers: corsHeaders });
  } catch (e) {
    console.error("[userstate] default", e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config = {
  path: "/api/userstate",
};
