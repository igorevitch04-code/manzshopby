// Netlify Function: хранение корзины / избранного / бонусов по Telegram user id
// Клиент: POST /.netlify/functions/userstate
//   { action: "get", id: "123" }
//   { action: "set", id: "123", state: { cart, favorites, bonusBalance, updatedAt } }

import { getStore } from "@netlify/blobs";

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

const getUserStore = () => {
  try {
    // Именованный store (не зависит от deploy context)
    return getStore({ name: "manz-userstate", consistency: "strong" });
  } catch (e) {
    try {
      return getStore("manz-userstate");
    } catch (e2) {
      return null;
    }
  }
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
    const store = getUserStore();
    if (!store) {
      return json(500, { ok: false, error: "blobs_unavailable" });
    }

    let body = {};
    if (event.body) {
      try {
        body = JSON.parse(event.body);
      } catch (e) {
        return json(400, { ok: false, error: "invalid_json" });
      }
    }

    // Поддержка GET ?id=123
    const qs = event.queryStringParameters || {};
    const action = String(body.action || qs.action || "get").toLowerCase();
    const id = String(body.id || qs.id || "").trim();

    if (!id || !/^\d+$/.test(id)) {
      return json(400, { ok: false, error: "invalid_id" });
    }

    const key = `user_${id}`;

    if (action === "get" || action === "getstate") {
      const raw = await store.get(key, { type: "json" });
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
        orderHistory: Array.isArray(state.orderHistory) ? state.orderHistory.slice(0, 40) : [],
        referralCount: Number(state.referralCount) || 0,
        referralEarnings: Number(state.referralEarnings) || 0,
        orders: Number(state.orders) || 0,
        updatedAt: state.updatedAt || new Date().toISOString(),
      };
      await store.setJSON(key, payload);
      return json(200, {
        ok: true,
        cart: payload.cart.length,
        favorites: payload.favorites.length,
        updatedAt: payload.updatedAt,
      });
    }

    return json(400, { ok: false, error: "unknown_action" });
  } catch (e) {
    console.error("[userstate]", e);
    return json(500, { ok: false, error: String(e && e.message ? e.message : e) });
  }
};
