/**
 * Общий каталог товаров для Mini App (Netlify Functions + Blobs).
 * GET  /.netlify/functions/catalog  → { products: [...] }
 * POST /.netlify/functions/catalog  → body { products: [...] }
 */
import { getStore } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const json = (status, data) =>
  new Response(JSON.stringify(data), { status, headers: corsHeaders });

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  let store;
  try {
    store = getStore({ name: "manzshop-catalog", consistency: "strong" });
  } catch (e) {
    console.error("[catalog] blobs init", e);
    return json(500, { ok: false, error: "blobs_unavailable", products: [] });
  }

  try {
    if (req.method === "GET") {
      const data = await store.get("products", { type: "json" });
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
      const list = Array.isArray(body.products) ? body.products : [];
      // Не храним base64-фото (слишком большие)
      const products = list.map((p) => {
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

      const payload = {
        products,
        updatedAt: new Date().toISOString(),
      };
      await store.setJSON("products", payload);
      return json(200, { ok: true, count: products.length, updatedAt: payload.updatedAt });
    }

    return json(405, { ok: false, error: "method_not_allowed" });
  } catch (e) {
    console.error("[catalog]", e);
    return json(500, { ok: false, error: String(e && e.message ? e.message : e) });
  }
};

export const config = {
  path: "/api/catalog",
};
