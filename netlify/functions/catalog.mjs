/**
 * Каталог — Netlify Blobs
 * Работает и как Functions 2.0 (/api/catalog), и как classic handler
 */
import { getStore, connectLambda } from "@netlify/blobs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function normalizeProducts(list) {
  return (Array.isArray(list) ? list : []).map(function (p) {
    var image =
      p && typeof p.image === "string" && String(p.image).indexOf("data:") === 0
        ? ""
        : (p && p.image) || "";
    var images = Array.isArray(p.images)
      ? p.images
          .filter(function (u) {
            return typeof u === "string" && String(u).indexOf("data:") !== 0;
          })
          .map(function (u) {
            return String(u).slice(0, 400);
          })
          .slice(0, 8)
      : image
        ? [image]
        : [];
    var ratings = Array.isArray(p.ratings)
      ? p.ratings.slice(-40).map(function (r) {
          return {
            userId: r.userId,
            userName: String(r.userName || "").slice(0, 40),
            rating: Number(r.rating) || 0,
            comment: String(r.comment || "").slice(0, 400),
            date: r.date || null,
            approved: r.approved === true,
            adminReply: r.adminReply ? String(r.adminReply).slice(0, 300) : null,
          };
        })
      : [];
    return {
      id: p.id,
      brand: p.brand || "",
      name: p.name || "",
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
      image: images[0] || image || "",
      images: images,
      description: String(p.description || "").slice(0, 500),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      sales: Number(p.sales) || 0,
      averageRating: Number(p.averageRating) || 0,
      pinned: !!p.pinned,
      hidden: !!p.hidden,
      createdAt: p.createdAt || null,
      ratings: ratings,
    };
  });
}

async function readProducts(store) {
  var products = [];
  var updatedAt = null;
  try {
    var raw = await store.get("products");
    if (raw) {
      var data = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (data && Array.isArray(data.products)) {
        products = data.products;
        updatedAt = data.updatedAt || null;
      } else if (Array.isArray(data)) {
        products = data;
      }
    }
  } catch (e) {
    console.error("[catalog] read", e);
  }
  return { products: products, updatedAt: updatedAt };
}

async function handle(method, bodyObj) {
  var store = getStore("catalog");
  var current = await readProducts(store);

  if (method === "GET") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        products: current.products,
        updatedAt: current.updatedAt,
        storage: "netlify-blobs",
        count: current.products.length,
      }),
    };
  }

  if (method === "POST") {
    var next = normalizeProducts(bodyObj && bodyObj.products);
    if (!next.length && current.products.length > 0) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          ok: false,
          error: "refuse_empty_overwrite",
          count: current.products.length,
        }),
      };
    }
    var payload = {
      products: next,
      updatedAt: new Date().toISOString(),
      v: 3,
    };
    await store.set("products", JSON.stringify(payload));
    var verify = await readProducts(store);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: true,
        count: next.length,
        verified: verify.products.length,
        updatedAt: payload.updatedAt,
        storage: "netlify-blobs",
      }),
    };
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ ok: false, error: "method_not_allowed" }),
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
  if (event.httpMethod === "POST") {
    try {
      bodyObj = JSON.parse(event.body || "{}");
    } catch (e) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ ok: false, error: "invalid_json" }),
      };
    }
  }

  try {
    return await handle(event.httpMethod, bodyObj);
  } catch (e) {
    console.error("[catalog] handler", e);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
        products: [],
      }),
    };
  }
}

// Functions 2.0 /api/catalog
export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }
  var bodyObj = {};
  if (req.method === "POST") {
    try {
      bodyObj = await req.json();
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: "invalid_json" }), {
        status: 400,
        headers: corsHeaders,
      });
    }
  }
  try {
    var res = await handle(req.method, bodyObj);
    return new Response(res.body, { status: res.statusCode, headers: corsHeaders });
  } catch (e) {
    console.error("[catalog] default", e);
    return new Response(
      JSON.stringify({
        ok: false,
        error: String(e && e.message ? e.message : e),
        products: [],
      }),
      { status: 500, headers: corsHeaders }
    );
  }
};

export const config = {
  path: "/api/catalog",
};
