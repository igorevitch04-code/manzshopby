/**
 * Общие заказы + статусы (для CRM и клиента)
 * GET/POST /api/orders
 *
 * Blob ID берётся из Netlify Env: ORDERS_BLOB_ID
 * (больше НЕ пишем в short_description бота)
 *
 * POST body:
 *  { orders: [...] }           — полная замена
 *  { order: {...} }            — добавить/обновить один
 *  { patch: { id, ...fields } } — обновить поля одного
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

const compact = (o) => ({
  id: o.id,
  date: o.date || null,
  status: o.status || "Новый",
  fullName: (o.fullName || "").slice(0, 80),
  phone: (o.phone || "").slice(0, 40),
  address: (o.address || "").slice(0, 160),
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
  items: Array.isArray(o.items)
    ? o.items.slice(0, 10).map((i) => ({
        id: i.id,
        name: (i.name || "").slice(0, 60),
        brand: (i.brand || "").slice(0, 40),
        size: i.size || null,
        price: Number(i.price) || 0,
      }))
    : [],
});

async function blobRead(id) {
  if (!id) return null;
  try {
    const r = await fetch(`https://jsonblob.com/api/jsonBlob/${id}`, {
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
      const r = await fetch(`https://jsonblob.com/api/jsonBlob/${id}`, {
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

/** Только чтение env. Описание бота больше не трогаем. */
function getOrdersBlobId() {
  return (process.env.ORDERS_BLOB_ID || "").trim() || null;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    let blobId = getOrdersBlobId();

    if (req.method === "GET") {
      const data = blobId ? await blobRead(blobId) : null;
      const orders =
        data && Array.isArray(data.orders)
          ? data.orders
          : Array.isArray(data)
            ? data
            : [];
      return json(200, {
        ok: true,
        orders,
        updatedAt: (data && data.updatedAt) || null,
        blobId: blobId || null,
        storage: blobId ? "jsonblob+env" : "empty",
      });
    }

    if (req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
        return json(400, { ok: false, error: "invalid_json" });
      }

      let orders = [];
      const existingData = blobId ? await blobRead(blobId) : null;
      const existing =
        existingData && Array.isArray(existingData.orders)
          ? existingData.orders
          : [];

      if (body.patch && body.patch.id != null) {
        const patch = body.patch;
        const map = new Map(existing.map((o) => [String(o.id), o]));
        const cur = map.get(String(patch.id)) || { id: patch.id };
        map.set(String(patch.id), compact({ ...cur, ...patch }));
        orders = Array.from(map.values());
      } else if (Array.isArray(body.orders)) {
        orders = body.orders.map(compact);
      } else if (body.order && body.order.id != null) {
        const c = compact(body.order);
        const without = existing.filter((o) => String(o.id) !== String(c.id));
        orders = [c, ...without].slice(0, 80);
      } else {
        return json(400, { ok: false, error: "need orders, order, or patch" });
      }

      orders.sort((a, b) => {
        const da = a.date ? new Date(a.date).getTime() : 0;
        const db = b.date ? new Date(b.date).getTime() : 0;
        return db - da;
      });

      const payload = {
        orders,
        updatedAt: new Date().toISOString(),
        v: 1,
      };

      const written = await blobWrite(blobId, payload);
      if (!written) {
        return json(500, { ok: false, error: "blob_write_failed" });
      }

      // Если ID новый — клиенту нужно прописать ORDERS_BLOB_ID в Netlify Env
      const needEnvUpdate = !blobId || written !== blobId;

      return json(200, {
        ok: true,
        count: orders.length,
        blobId: written,
        updatedAt: payload.updatedAt,
        storage: "jsonblob+env",
        needEnvUpdate,
        hint: needEnvUpdate
          ? `Добавьте в Netlify Env: ORDERS_BLOB_ID=${written}`
          : undefined,
      });
    }

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[orders]", e);
    return json(500, {
      ok: false,
      error: String(e && e.message ? e.message : e),
      orders: [],
    });
  }
};

export const config = {
  path: "/api/orders",
};
