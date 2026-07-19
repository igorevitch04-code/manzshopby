// Netlify Function: корзина / избранное по Telegram user id
// Хранение:
//   1) Netlify Blobs (прод), если пакет есть
//   2) Локальный файл .netlify/userstate-data.json (netlify dev) — всегда
//
// POST /.netlify/functions/userstate
//   { action: "get", id: "123" }
//   { action: "set", id: "123", state: { cart, favorites, ... } }

import fs from "fs";
import path from "path";

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

// ---- Local file store ----
const localPaths = () => [
  path.join(process.cwd(), ".netlify", "userstate-data.json"),
  path.join(process.cwd(), "userstate-data.json"),
  path.join("/tmp", "manz-userstate-data.json"),
];

const localReadAll = () => {
  for (const p of localPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const data = JSON.parse(fs.readFileSync(p, "utf8"));
      if (data && typeof data === "object") return data;
    } catch (e) {}
  }
  return {};
};

const localWriteAll = (all) => {
  const text = JSON.stringify(all);
  for (const p of localPaths()) {
    try {
      const dir = path.dirname(p);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(p, text, "utf8");
      return true;
    } catch (e) {
      console.warn("[userstate] write fail", p, e && e.message);
    }
  }
  return false;
};

// ---- Optional Blobs ----
const tryGetBlobStore = async (event) => {
  try {
    const mod = await import("@netlify/blobs");
    try {
      if (typeof mod.connectLambda === "function") mod.connectLambda(event);
    } catch (e) {}
    try {
      return mod.getStore({ name: "manz-userstate", consistency: "strong" });
    } catch (e1) {
      try {
        return mod.getStore("manz-userstate");
      } catch (e2) {
        return null;
      }
    }
  } catch (e) {
    return null;
  }
};

const blobGet = async (store, key) => {
  try {
    const v = await store.get(key, { type: "json" });
    return v && typeof v === "object" ? v : null;
  } catch (e) {
    try {
      const t = await store.get(key);
      return t ? JSON.parse(t) : null;
    } catch (e2) {
      return null;
    }
  }
};

const blobSet = async (store, key, value) => {
  if (typeof store.setJSON === "function") {
    await store.setJSON(key, value);
  } else {
    await store.set(key, JSON.stringify(value), { contentType: "application/json" });
  }
};

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  try {
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

    // -------- GET --------
    if (action === "get" || action === "getstate") {
      const store = await tryGetBlobStore(event);
      if (store) {
        try {
          const state = await blobGet(store, key);
          if (state) return json(200, { ok: true, state, source: "blobs" });
        } catch (e) {
          console.warn("[userstate] blob get", e && e.message);
        }
      }

      const all = localReadAll();
      if (all[key]) return json(200, { ok: true, state: all[key], source: "local" });

      return json(200, { ok: true, state: null });
    }

    // -------- SET --------
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

      let saved = false;
      let source = null;

      const store = await tryGetBlobStore(event);
      if (store) {
        try {
          await blobSet(store, key, payload);
          saved = true;
          source = "blobs";
        } catch (e) {
          console.warn("[userstate] blob set", e && e.message);
        }
      }

      const all = localReadAll();
      all[key] = payload;
      if (localWriteAll(all)) {
        saved = true;
        source = source || "local";
      }

      if (!saved) {
        return json(500, {
          ok: false,
          error: "storage_failed",
          detail: "could not write blobs or local file",
        });
      }

      return json(200, {
        ok: true,
        cart: payload.cart.length,
        favorites: payload.favorites.length,
        updatedAt: payload.updatedAt,
        source,
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
