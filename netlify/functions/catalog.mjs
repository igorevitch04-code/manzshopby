/**
 * Каталог товаров
 * GET/POST /api/catalog
 *
 * Blob ID:
 *  1) Netlify Env CATALOG_BLOB_ID (предпочтительно)
 *  2) fallback: mz:… из short_description бота (только чтение, не перезаписываем)
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

const BOT_TOKEN =
  process.env.BOT_TOKEN ||
  process.env.PUSH_BOT_TOKEN ||
  "8912775566:AAHEExxwO5Ub39DU0tDT97Hlppw1IfLwjvU";

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

/** Только чтение short_description — не перезаписываем описание бота */
async function blobIdFromBotDescription() {
  try {
    const r = await fetch(
      "https://api.telegram.org/bot" + BOT_TOKEN + "/getMyShortDescription",
      { cache: "no-store" }
    );
    const data = await r.json();
    const desc =
      (data && data.result && data.result.short_description) || "";
    const m = String(desc).match(/mz:([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch (e) {
    return null;
  }
}

async function resolveCatalogBlobId() {
  const fromEnv = (process.env.CATALOG_BLOB_ID || "").trim();
  if (fromEnv) return fromEnv;
  return await blobIdFromBotDescription();
}

export default async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("", { status: 204, headers: corsHeaders });
  }

  try {
    let blobId = await resolveCatalogBlobId();

    if (req.method === "GET") {
      const data = blobId ? await blobRead(blobId) : null;
      let products = [];
      if (data && Array.isArray(data.products)) products = data.products;
      else if (Array.isArray(data)) products = data;
      return json(200, {
        ok: true,
        products: products,
        updatedAt: (data && data.updatedAt) || null,
        storage: blobId ? "jsonblob" : "empty",
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

      // Защита: не затираем каталог пустым массивом, если на сервере уже есть товары
      if (!products.length) {
        const existing = blobId ? await blobRead(blobId) : null;
        const existingList =
          existing && Array.isArray(existing.products)
            ? existing.products
            : Array.isArray(existing)
              ? existing
              : [];
        if (existingList.length > 0) {
          return json(400, {
            ok: false,
            error: "refuse_empty_overwrite",
            message:
              "Отклонён пустой каталог: на сервере уже есть " +
              existingList.length +
              " товаров. Сначала загрузите товары локально.",
            count: existingList.length,
          });
        }
      }

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

      const needEnvUpdate =
        !(process.env.CATALOG_BLOB_ID || "").trim() || written !== blobId;
      const verify = await blobRead(written);

      return json(200, {
        ok: true,
        count: products.length,
        updatedAt: payload.updatedAt,
        storage: "jsonblob",
        blobId: written,
        needEnvUpdate,
        hint: needEnvUpdate
          ? "Добавьте в Netlify Env: CATALOG_BLOB_ID=" + written
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
