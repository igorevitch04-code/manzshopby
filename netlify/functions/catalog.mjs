/**
 * Каталог товаров
 * GET/POST /api/catalog
 *
 * Blob ID берётся из Netlify Env: CATALOG_BLOB_ID
 * (больше НЕ пишем в short_description бота)
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

const normalizeProducts = (list) =>
  (Array.isArray(list) ? list : []).map((p) => {
    const image =
      p && typeof p.image === "string" && p.image.startsWith("data:")
        ? ""
        : (p && p.image) || "";
    const images = Array.isArray(p.images)
      ? p.images
          .filter((u) => typeof u === "string" && !u.startsWith("data:"))
          .map((u) => String(u).slice(0, 400))
          .slice(0, 8)
      : image
        ? [image]
        : [];
    const ratings = Array.isArray(p.ratings)
      ? p.ratings.slice(-40).map((r) => ({
          userId: r.userId,
          userName: String(r.userName || "").slice(0, 40),
          rating: Number(r.rating) || 0,
          comment: String(r.comment || "").slice(0, 400),
          date: r.date || null,
          approved: r.approved === true,
          adminReply: r.adminReply ? String(r.adminReply).slice(0, 300) : null,
        }))
      : [];
    return {
      id: p.id,
      brand: p.brand || "",
      name: p.name || "",
      price: Number(p.price) || 0,
      oldPrice: p.oldPrice != null ? Number(p.oldPrice) : null,
      image: images[0] || image || "",
      images,
      description: String(p.description || "").slice(0, 500),
      sizes: Array.isArray(p.sizes) ? p.sizes : [],
      sales: Number(p.sales) || 0,
      averageRating: Number(p.averageRating) || 0,
      pinned: !!p.pinned,
      hidden: !!p.hidden,
      createdAt: p.createdAt || null,
      ratings,
    };
  });

async function blobRead(id) {
  if (!id) return null;
  try {
    const r = await fetch("https://jsonblob.com/api/jsonBlob/" + id, {
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
      const r = await fetch("https://jsonblob.com/api/jsonBlob/" + id, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body,
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
      body: body,
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

function getCatalogBlobId() {
  return (process.env.CATALOG_BLOB_ID || "").trim() || null;
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    let blobId = getCatalogBlobId();

    if (req.method === "GET") {
      const data = blobId ? await blobRead(blobId) : null;
      let products = [];
      if (data && Array.isArray(data.products)) products = data.products;
      else if (Array.isArray(data)) products = data;
      return json(200, {
        ok: true,
        products: products,
        updatedAt: (data && data.updatedAt) || null,
        storage: blobId ? "jsonblob+env" : "empty",
        blobId: blobId || null,
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
        products: products,
        updatedAt: new Date().toISOString(),
        v: 2,
      };

      const written = await blobWrite(blobId, payload);
      if (!written) {
        return json(500, {
          ok: false,
          error: "blob_write_failed",
          products: [],
        });
      }

      const needEnvUpdate = !blobId || written !== blobId;
      const verify = await blobRead(written);

      return json(200, {
        ok: true,
        count: products.length,
        updatedAt: payload.updatedAt,
        storage: "jsonblob+env",
        blobId: written,
        needEnvUpdate,
        hint: needEnvUpdate
          ? `Добавьте в Netlify Env: CATALOG_BLOB_ID=${written}`
          : undefined,
        verified: !!(verify && (verify.products || Array.isArray(verify))),
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
