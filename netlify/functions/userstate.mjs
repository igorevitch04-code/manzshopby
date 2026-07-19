// Netlify Function: корзина / избранное / бонусы по Telegram user id
// POST /.netlify/functions/userstate
//   { action: "get", id: "123456" }
//   { action: "set", id: "123456", state: { cart, favorites, bonusBalance, updatedAt } }
//
// Важно: для Lambda-совместимого handler нужен connectLambda(event),
// иначе getStore падает и клиент видит «синхронизация не удалась».

import { connectLambda, getStore } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

const json = (status, body) => ({
  statusCode: status,
  headers: corsHeaders,
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    // КРИТИЧНО для Lambda-совместимого режима (export const handler)
    try {
      connectLambda(event);
    } catch (e) {
      console.warn("[userstate] connectLambda:", e && e.message);
    }

    let store;
    try {
      store = getStore({ name: "manz-userstate", consistency: "strong" });
    } catch (e1) {
      try {
        store = getStore("manz-userstate");
      } catch (e2) {
        console.error("[userstate] getStore failed", e1, e2);
        return json(500, {
          ok: false,
          error: "blobs_unavailable",
          detail: String((e2 && e2.message) || (e1 && e1.message) || e2 || e1),
        });
      }
    }

    let body = {};
    if (event.body) {
      try {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body, "base64").toString("utf8")
          : event.body;
        body = JSON.parse(raw);
      } catch (e) {
        return json(400, { ok: false, error: "invalid_json" });
      }
    }

    const qs = event.queryStringParameters || {};
    const action = String(body.action || qs.action || "get").toLowerCase();
    const id = String(body.id || qs.id || "").trim();

    if (!id || !/^\d+$/.test(id)) {
      return json(400, { ok: false, error: "invalid_id", got: id });
    }

    const key = `user_${id}`;

    if (action === "get" || action === "getstate") {
      let raw = null;
      try {
        raw = await store.get(key, { type: "json" });
      } catch (e) {
        try {
          const text = await store.get(key);
          raw = text ? JSON.parse(text) : null;
        } catch (e2) {
          console.warn("[userstate] get parse", e2 && e2.message);
          raw = null;
        }
      }

      if (!raw || typeof raw !== "object") {
        return json(200, { ok: true, state: null });
      }
      return json(200, { ok: true, state: raw });
    }

    if (action === "set" || action === "setstate") {
      const state = body.state && typeof body.state === "object" ? body.state : {};
      const payload = {
        cart: Array.isArray(state.cart) ? state.cart : [],
        favorites: Array.isArray(state.favorites) ? state.favorites : [],
        bonusBalance: Number(state.bonusBalance) || 0,
        orderHistory: Array.isArray(state.orderHistory)
          ? state.orderHistory.slice(0, 40)
          : [],
        referralCount: Number(state.referralCount) || 0,
        referralEarnings: Number(state.referralEarnings) || 0,
        orders: Number(state.orders) || 0,
        updatedAt: state.updatedAt || new Date().toISOString(),
      };

      try {
        if (typeof store.setJSON === "function") {
          await store.setJSON(key, payload);
        } else {
          await store.set(key, JSON.stringify(payload), {
            contentType: "application/json",
          });
        }
      } catch (e) {
        console.error("[userstate] set failed", e);
        return json(500, {
          ok: false,
          error: "set_failed",
          detail: String(e && e.message ? e.message : e),
        });
      }

      return json(200, {
        ok: true,
        cart: payload.cart.length,
        favorites: payload.favorites.length,
        updatedAt: payload.updatedAt,
      });
    }

    return json(400, { ok: false, error: "unknown_action", action });
  } catch (e) {
    console.error("[userstate] fatal", e);
    return json(500, {
      ok: false,
      error: "fatal",
      detail: String(e && e.message ? e.message : e),
    });
  }
};
