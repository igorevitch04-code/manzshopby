/**
 * Общий каталог товаров (Netlify Functions + Blobs)
 * URL: https://manzshop.netlify.app/api/catalog
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

const getBlobStore = async (context) => {
  // 1) Современный способ через context (без npm-пакета)
  try {
    if (context && context.blobs && typeof context.blobs.getStore === "function") {
      return context.blobs.getStore("manzshop-catalog");
    }
  } catch (e) {
    console.warn("context.blobs failed", e);
  }

  // 2) Пакет @netlify/blobs
  try {
    const mod = await import("@netlify/blobs");
    if (mod && typeof mod.getStore === "function") {
      return mod.getStore({ name: "manzshop-catalog", consistency: "strong" });
    }
  } catch (e) {
    console.warn("@netlify/blobs import failed", e);
  }

  return null;
};

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

export default async (req, context) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    const store = await getBlobStore(context);
    if (!store) {
      return json(500, {
        ok: false,
        error: "blobs_unavailable",
        hint: "Netlify Blobs не доступны. Проверьте план сайта / логи Functions.",
        products: [],
      });
    }

    if (req.method === "GET") {
      let data = null;
      try {
        data = await store.get("products", { type: "json" });
      } catch (e) {
        // ключа ещё нет
        data = null;
      }
      const products = data && Array.isArray(data.products) ? data.products : [];
      return json(200, {
        ok: true,
        products,
        updatedAt: (data && data.updatedAt) || null,
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
      };
      await store.setJSON("products", payload);
      return json(200, {
        ok: true,
        count: products.length,
        updatedAt: payload.updatedAt,
      });
    }

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[catalog] error", e);
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
