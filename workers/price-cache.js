const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_SOURCE_TIMEOUT_MS = 5000;
const STALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CACHE_KEY = "prices:latest";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60"
  };
}

function jsonResponse(payload, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
      ...extraHeaders
    }
  });
}

function getTtlSeconds(env) {
  const ttl = Number(env.PRICE_CACHE_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : DEFAULT_TTL_SECONDS;
}

function getSourceTimeoutMs(env) {
  const timeout = Number(env.PRICE_SOURCE_TIMEOUT_MS || DEFAULT_SOURCE_TIMEOUT_MS);
  return Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_SOURCE_TIMEOUT_MS;
}

async function readStoredPrices(env) {
  const cached = await env.ISARICH_PRICE_CACHE.get(CACHE_KEY, "json");
  if (!cached?.data || !cached?.updatedAt) return null;

  const ageMs = Date.now() - Date.parse(cached.updatedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) return null;

  return cached;
}

async function readCachedPrices(env) {
  const cached = await readStoredPrices(env);
  if (!cached) return null;

  const ageMs = Date.now() - Date.parse(cached.updatedAt);
  if (ageMs > getTtlSeconds(env) * 1000) return null;

  return cached;
}

async function fetchPrices(env) {
  if (!env.PRICE_SOURCE_URL) {
    throw new Error("PRICE_SOURCE_URL is not configured");
  }

  const sourceUrl = new URL(env.PRICE_SOURCE_URL);
  sourceUrl.searchParams.set("action", "prices");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("PRICE_SOURCE_TIMEOUT"), getSourceTimeoutMs(env));
  let response;

  try {
    response = await fetch(sourceUrl.toString(), {
      method: "GET",
      headers: { accept: "application/json" },
      signal: controller.signal,
      cf: { cacheTtl: 60, cacheEverything: false }
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`price source failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("price source returned invalid JSON");
  }

  const payload = {
    ok: true,
    updatedAt: new Date().toISOString(),
    source: "apps-script",
    data
  };

  await env.ISARICH_PRICE_CACHE.put(CACHE_KEY, JSON.stringify(payload), {
    expirationTtl: Math.max(getTtlSeconds(env) * 288, STALE_TTL_SECONDS)
  });

  return payload;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    if (request.method !== "GET") {
      return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
    }

    if (!["/", "/prices", "/prices.json"].includes(url.pathname)) {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }

    try {
      const force = url.searchParams.get("refresh") === "1";
      const cached = force ? null : await readCachedPrices(env);
      if (cached) {
        return jsonResponse(cached.data, 200, {
          "X-ISARICH-Cache": "HIT",
          "X-ISARICH-Updated-At": cached.updatedAt
        });
      }

      const stale = force ? null : await readStoredPrices(env);
      if (stale) {
        const refreshPromise = fetchPrices(env).catch((error) => {
          console.warn("background price refresh failed", error);
        });
        if (ctx?.waitUntil) ctx.waitUntil(refreshPromise);
        return jsonResponse(stale.data, 200, {
          "X-ISARICH-Cache": "STALE-WHILE-REVALIDATE",
          "X-ISARICH-Updated-At": stale.updatedAt
        });
      }

      const fresh = await fetchPrices(env);
      return jsonResponse(fresh.data, 200, {
        "X-ISARICH-Cache": "MISS",
        "X-ISARICH-Updated-At": fresh.updatedAt
      });
    } catch (error) {
      const stale = await readStoredPrices(env);
      if (stale?.data) {
        return jsonResponse(stale.data, 200, {
          "X-ISARICH-Cache": "STALE",
          "X-ISARICH-Updated-At": stale.updatedAt,
          "X-ISARICH-Error": String(error?.message || error)
        });
      }

      return jsonResponse({
        ok: false,
        error: "price_cache_failed",
        message: String(error?.message || error)
      }, 500);
    }
  }
};
