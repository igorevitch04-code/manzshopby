/**
 * Каталог товаров без Netlify Blobs.
 * Хранение: jsonblob.com + указатель id в keyvalue (всё с сервера, без CORS).
 *
 * GET  /api/catalog
 * POST /api/catalog  body: { products: [...] }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const KV_APP = "manzshopby";
const POINTER_KEY = "catalog_blob_id_v1";

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

const normalizeProducts = (list) =>
  (Array.isArray(list) ? list : []).map((p) => {
    const image =
      p && typeof p.image === "string" && p.image.startsWith("data:")
        ? ""
        : (p && p.image) || "";
    return {
      id: p.id,
      brand: p.brand || "",
      name: p.name || "",
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
      image,
      description: (p.description || "").slice(0, 500),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      sales: Number(p.sales) || 0,
      averageRating: Number(p.averageRating) || 0,
      pinned: !!p.pinned,
      createdAt: p.createdAt || null,
      ratings: Array.isArray(p.ratings) ? p.ratings.slice(-40) : [],
    };
  });

async function kvGet(key) {
  const url = `https://keyvalue.immanuel.co/api/KeyVal/GetValue/${KV_APP}/${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    let t = (await r.text()) || "";
    t = t.replace(/^"|"$/g, "").trim();
    if (!t || t === "null" || t === "undefined") return null;
    return t;
  } catch (e) {
    console.warn("kvGet", e);
    return null;
  }
}

async function kvSet(key, value) {
  const url =
    `https://keyvalue.immanuel.co/api/KeyVal/UpdateValue/${KV_APP}/` +
    `${encodeURIComponent(key)}/${encodeURIComponent(String(value))}`;
  try {
    const r = await fetch(url, { method: "GET", cache: "no-store" });
    return r.ok;
  } catch (e) {
    console.warn("kvSet", e);
    return false;
  }
}

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
    console.warn("blobRead", e);
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
    } catch (e) {
      console.warn("blob PUT", e);
    }
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
  } catch (e) {
    console.warn("blob POST", e);
  }
  return null;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    if (req.method === "GET") {
      const blobId = await kvGet(POINTER_KEY);
      const data = blobId ? await blobRead(blobId) : null;
      const products =
        data && Array.isArray(data.products)
          ? data.products
          : Array.isArray(data)
            ? data
            : [];
      return json(200, {
        ok: true,
        products,
        updatedAt: (data && data.updatedAt) || null,
        storage: blobId ? "jsonblob" : "empty",
      });
    }

    if (req.method === "POST") {
      let body = {};
      try {
        body = await req.json();
      } catch (e) {
        return json(400, { ok: false, error: "invalid_json" });
      }
      const products = normalizeProducts(body.products);
      const payload = {
        products,
        updatedAt: new Date().toISOString(),
        v: 1,
      };

      let blobId = await kvGet(POINTER_KEY);
      const written = await blobWrite(blobId, payload);
      if (!written) {
        return json(500, {
          ok: false,
          error: "blob_write_failed",
          products: [],
        });
      }
      if (written !== blobId) {
        await kvSet(POINTER_KEY, written);
      }

      return json(200, {
        ok: true,
        count: products.length,
        updatedAt: payload.updatedAt,
        storage: "jsonblob",
      });
    }

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[catalog]", e);
    return json(500, {
      ok: false,
      error: String(e && e.message ? e.message : e),
      products: [],
    });
  }
};

export const config = {
  path: "/api/catalog",
};
