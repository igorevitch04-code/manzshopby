// Netlify Function: корзина / избранное по Telegram user id
// БЕЗ @netlify/blobs — храним на getpantry.cloud (с сервера CORS не мешает)
//
// POST /.netlify/functions/userstate
//   { action: "get", id: "123456" }
//   { action: "set", id: "123456", state: { cart, favorites, bonusBalance, updatedAt } }

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

// Фиксированный pantry basket для всех user-state (ключ = user id внутри)
// Можно переопределить через env USERSTATE_PANTRY_ID
const DEFAULT_PANTRY_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"; // заменится при первом create
const PANTRY_BASKET = "manz_userstate_v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensurePantryId() {
  const fromEnv = (process.env.USERSTATE_PANTRY_ID || "").trim();
  if (fromEnv) return fromEnv;

  // Пробуем прочитать id из простого KV (keyvalue.immanuel.co)
  const KV_NS = "manzshopby";
  const KV_KEY = "userstate_pantry_id_v1";
  try {
    const getUrl = `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${KV_NS}/${encodeURIComponent(KV_KEY)}`;
    const r = await fetch(getUrl, { cache: "no-store" });
    if (r.ok) {
      let text = (await r.text()) || "";
      text = text.replace(/^"|"$/g, "").trim();
      if (text && text.length > 10 && text !== "null") return text;
    }
  } catch (e) {}

  // Создаём новый pantry
  try {
    const r = await fetch("https://getpantry.cloud/apiv1/pantry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "manzshop-userstate",
        description: "cart favorites sync",
      }),
    });
    const data = await r.json().catch(() => ({}));
    const id = data?.pantryId || data?.id || null;
    if (id) {
      // Сохраняем id в KV
      try {
        const setUrl =
          `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${KV_NS}/` +
          `${encodeURIComponent(KV_KEY)}/${encodeURIComponent(id)}`;
        await fetch(setUrl, { method: "GET", cache: "no-store" });
      } catch (e) {}
      return id;
    }
  } catch (e) {
    console.error("[userstate] create pantry", e);
  }

  // Последний шанс — env или ошибка
  return null;
}

async function pantryGet(pantryId, basket) {
  const url = `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/${basket}`;
  const r = await fetch(url, { cache: "no-store" });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(`pantry get ${r.status}`);
  const data = await r.json().catch(() => ({}));
  return data && typeof data === "object" ? data : {};
}

async function pantryPut(pantryId, basket, data) {
  const url = `https://getpantry.cloud/apiv1/pantry/${pantryId}/basket/${basket}`;
  // create or replace
  let r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    r = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }
  if (!r.ok) throw new Error(`pantry put ${r.status}`);
  return true;
}

// Fallback: keyvalue по одному пользователю (если pantry недоступен)
async function kvGet(key) {
  const url = `https://keyvalue.immanuel.co/api/KeyVal/GetValue/manzshopby/${encodeURIComponent(key)}`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  let text = (await r.text()) || "";
  text = text.replace(/^"|"$/g, "").trim();
  if (!text || text === "null") return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

async function kvSet(key, value) {
  const json = typeof value === "string" ? value : JSON.stringify(value);
  if (json.length > 1400) return false;
  const url =
    `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/manzshopby/` +
    `${encodeURIComponent(key)}/${encodeURIComponent(json)}`;
  const r = await fetch(url, { method: "GET", cache: "no-store" });
  return r.ok;
}

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

    const userKey = `u_${id}`;

    if (action === "get" || action === "getstate") {
      // 1) Pantry
      try {
        const pantryId = await ensurePantryId();
        if (pantryId) {
          const all = await pantryGet(pantryId, PANTRY_BASKET);
          const state = all && all[userKey] ? all[userKey] : null;
          if (state) {
            return json(200, { ok: true, state, source: "pantry" });
          }
        }
      } catch (e) {
        console.warn("[userstate] pantry get", e && e.message);
      }

      // 2) KV
      try {
        const state = await kvGet(`ustate_${id}`);
        if (state) {
          return json(200, { ok: true, state, source: "kv" });
        }
      } catch (e) {
        console.warn("[userstate] kv get", e && e.message);
      }

      return json(200, { ok: true, state: null });
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

      let saved = false;
      let source = null;

      // 1) Pantry — весь объект пользователей
      try {
        const pantryId = await ensurePantryId();
        if (pantryId) {
          let all = {};
          try {
            all = await pantryGet(pantryId, PANTRY_BASKET);
          } catch (e) {
            all = {};
          }
          if (!all || typeof all !== "object") all = {};
          all[userKey] = payload;
          // не раздуваем бесконечно — чистим очень старые если > 200 ключей
          const keys = Object.keys(all);
          if (keys.length > 200) {
            const sorted = keys
              .map((k) => ({ k, t: Date.parse(all[k]?.updatedAt || 0) || 0 }))
              .sort((a, b) => a.t - b.t);
            for (let i = 0; i < sorted.length - 150; i++) {
              delete all[sorted[i].k];
            }
          }
          await pantryPut(pantryId, PANTRY_BASKET, all);
          saved = true;
          source = "pantry";
        }
      } catch (e) {
        console.warn("[userstate] pantry set", e && e.message);
      }

      // 2) KV backup (компактный)
      try {
        const compact = {
          cart: payload.cart.map((x) => ({
            id: x.id,
            name: x.name,
            brand: x.brand,
            price: x.price,
            size: x.size || null,
            image: typeof x.image === "string" ? x.image.slice(0, 80) : "",
          })),
          favorites: payload.favorites.map((x) => ({
            id: x.id,
            name: x.name,
            brand: x.brand,
            price: x.price,
            image: typeof x.image === "string" ? x.image.slice(0, 80) : "",
          })),
          bonusBalance: payload.bonusBalance,
          updatedAt: payload.updatedAt,
        };
        const ok = await kvSet(`ustate_${id}`, compact);
        if (ok) {
          saved = true;
          source = source || "kv";
        }
      } catch (e) {
        console.warn("[userstate] kv set", e && e.message);
      }

      if (!saved) {
        return json(500, {
          ok: false,
          error: "storage_failed",
          detail: "pantry and kv both failed",
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
