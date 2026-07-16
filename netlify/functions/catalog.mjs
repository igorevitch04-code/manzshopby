/**
 * Каталог: jsonblob (данные) + Telegram short_description (указатель на blob id).
 * GET/POST /api/catalog
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

// Тот же токен, что уже в App.jsx (он и так виден в клиенте)
const BOT_TOKEN = "8912775566:AAHEExxwO5Ub39DU0tDT97Hlppw1IfLwjvU";

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
      hidden: !!p.hidden,
      createdAt: p.createdAt || null,
      ratings: Array.isArray(p.ratings)
        ? p.ratings.slice(-40).map((r) => ({
            userId: r.userId,
            userName: (r.userName || "").slice(0, 40),
            rating: Number(r.rating) || 0,
            comment: (r.comment || "").slice(0, 400),
            date: r.date || null,
            approved: r.approved === true ? true : r.approved === false ? false : false,
            adminReply: r.adminReply ? String(r.adminReply).slice(0, 300) : null,
          }))
        : [],
    };
  });

async function tgGetDesc() {
  try {
    const r = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/getMyShortDescription`,
      { cache: "no-store" }
    );
    const data = await r.json();
    return (data && data.result && data.result.short_description) || "";
  } catch (e) {
    return "";
  }
}

async function tgGetPointer() {
  try {
    const desc = await tgGetDesc();
    const m = String(desc).match(/mz:([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  } catch (e) {
    console.warn("tgGetPointer", e);
    return null;
  }
}

async function tgSetPointer(blobId) {
  try {
    const desc = await tgGetDesc();
    const ord = String(desc).match(/ord:([A-Za-z0-9_-]+)/);
    const parts = [`mz:${blobId}`];
    if (ord) parts.push(`ord:${ord[1]}`);
    const text = parts.join(";");
    const body = `short_description=${encodeURIComponent(text)}`;
    const r = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/setMyShortDescription`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      }
    );
    const data = await r.json();
    console.log("tgSetPointer", data);
    return !!(data && data.ok);
  } catch (e) {
    console.warn("tgSetPointer", e);
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
    if (!r.ok) {
      console.warn("blobRead status", r.status);
      return null;
    }
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
      console.warn("blob PUT status", r.status, await r.text().catch(() => ""));
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
    const text = await r.text().catch(() => "");
    console.log("blob POST status", r.status, "headers x-jsonblob", r.headers.get("X-jsonblob"));

    if (r.ok || r.status === 201) {
      const x =
        r.headers.get("X-jsonblob") ||
        r.headers.get("x-jsonblob") ||
        r.headers.get("X-Jsonblob");
      if (x) return String(x).trim();

      const loc = r.headers.get("Location") || r.headers.get("location") || "";
      if (loc) {
        const parts = loc.split("/").filter(Boolean);
        if (parts.length) return parts[parts.length - 1];
      }

      // иногда id в теле
      try {
        const parsed = JSON.parse(text);
        if (parsed && parsed.id) return String(parsed.id);
      } catch (e) {}
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
      const blobId = await tgGetPointer();
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
        storage: blobId ? "jsonblob+tg" : "empty",
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
        products,
        updatedAt: new Date().toISOString(),
        v: 2,
      };

      let blobId = await tgGetPointer();
      const written = await blobWrite(blobId, payload);
      if (!written) {
        return json(500, {
          ok: false,
          error: "blob_write_failed",
          products: [],
        });
      }

      const pointerOk = await tgSetPointer(written);
      // перечитаем для проверки
      const verify = await blobRead(written);

      return json(200, {
        ok: true,
        count: products.length,
        updatedAt: payload.updatedAt,
        storage: "jsonblob+tg",
        blobId: written,
        pointerOk,
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
