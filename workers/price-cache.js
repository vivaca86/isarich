const DEFAULT_TTL_SECONDS = 300;
const DEFAULT_SOURCE_TIMEOUT_MS = 5000;
const STALE_TTL_SECONDS = 7 * 24 * 60 * 60;
const CACHE_KEY = "prices:latest";
const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const DEFAULT_USD_KRW_RATE = 1557;
const MAX_EXTRACT_IMAGES = 8;
const MAX_IMAGE_DATA_URL_CHARS = 8_000_000;
const OPENAI_PRICING_PER_1M = {
  "gpt-5.4-nano": { input: 0.20, cachedInput: 0.02, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.50 },
  "gpt-5.4": { input: 2.50, cachedInput: 0.25, output: 15.00 },
  "gpt-5.5": { input: 5.00, cachedInput: 0.50, output: 30.00 }
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

function requestError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeKnownTickers(rawTickers) {
  if (!Array.isArray(rawTickers)) return [];
  return rawTickers
    .slice(0, 120)
    .map((item) => {
      const ticker = String(item?.ticker || item?.code || "").trim();
      const name = String(item?.name || "").trim();
      const aliases = Array.isArray(item?.aliases)
        ? item.aliases.map((alias) => String(alias || "").trim()).filter(Boolean).slice(0, 12)
        : [];
      if (!ticker && !name) return null;
      return { ticker: ticker.slice(0, 24), name: name.slice(0, 80), aliases: aliases.map((alias) => alias.slice(0, 80)) };
    })
    .filter(Boolean);
}

function buildKnownTickerHint(rawTickers) {
  const tickers = sanitizeKnownTickers(rawTickers);
  if (!tickers.length) return "No app ticker list was provided.";
  return tickers
    .map((item) => {
      const aliasText = item.aliases?.length ? ` aliases: ${item.aliases.join(", ")}` : "";
      return `${item.ticker || "-"}: ${item.name || "-"}${aliasText}`;
    })
    .join("\n");
}

function sanitizeImages(rawImages) {
  if (!Array.isArray(rawImages) || !rawImages.length) {
    throw requestError("images_required");
  }
  if (rawImages.length > MAX_EXTRACT_IMAGES) {
    throw requestError(`too_many_images_max_${MAX_EXTRACT_IMAGES}`);
  }

  return rawImages.map((image, index) => {
    const name = String(image?.name || `image-${index + 1}`).trim().slice(0, 120);
    const imageUrl = String(image?.dataUrl || image?.image_url || "").trim();
    if (!/^data:image\/(png|jpe?g|webp);base64,/i.test(imageUrl)) {
      throw requestError(`invalid_image_${index + 1}`);
    }
    if (imageUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
      throw requestError(`image_too_large_${index + 1}`);
    }
    return { name, imageUrl };
  });
}

function getExtractSchema() {
  return {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            date: { type: "string" },
            ticker: { type: "string" },
            name: { type: "string" },
            shares: { type: "number" },
            price: { type: "number" },
            side: { type: "string", enum: ["buy", "sell", "deposit", "dividend", "unknown"] },
            category: { type: "string", enum: ["0", "1", "2", "3"] },
            sourceFile: { type: "string" },
            confidence: { type: "number" },
            memo: { type: "string" }
          },
          required: ["date", "ticker", "name", "shares", "price", "side", "category", "sourceFile", "confidence", "memo"]
        }
      },
      warnings: {
        type: "array",
        items: { type: "string" }
      }
    },
    required: ["items", "warnings"]
  };
}

function buildExtractPrompt(knownTickers) {
  return [
    "You extract Korean ISA brokerage transaction history from screenshots.",
    "Return only actual executed transaction rows. Ignore holdings, portfolio balances, quotes, recommendations, and totals unless they are transaction rows.",
    "For stock trades: side must be buy or sell, category must be \"0\", shares is positive quantity, and price is per-share execution price.",
    "Korean side cues are strict and override all other hints. If the same row contains 매도, 매도체결, 매도주문, 매도금액, 매도입금, 팔기, sell, sold, or sale, side MUST be \"sell\" and MUST NOT be \"buy\" or \"unknown\".",
    "If the same row contains 매수, 매수체결, 매수주문, 사기, buy, bought, or purchase, side MUST be \"buy\" and MUST NOT be \"sell\" or \"unknown\".",
    "Never default an unclear stock trade to buy. Use \"unknown\" only when no buy/sell/deposit/dividend side cue is visible in the transaction row; lower confidence and add a warning.",
    "For cash deposits: side must be deposit, ticker must be DEPOSIT, shares must be 1, price is the cash amount, category is \"1\" unless the row explicitly says special/bonus, then category \"2\".",
    "For dividends: side must be dividend, shares must be 1, price is the dividend amount, category must be \"3\". Use the underlying ticker/name if visible; otherwise ticker DEPOSIT and add a warning.",
    "Use YYYY-MM-DD dates. If a core field is missing, leave an empty string or 0 and lower confidence. Never invent unseen exact numbers.",
    "Known ticker hints from the app:",
    buildKnownTickerHint(knownTickers)
  ].join("\n");
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string") return data.output_text;
  const parts = [];
  (data?.output || []).forEach((output) => {
    (output?.content || []).forEach((content) => {
      if (typeof content?.text === "string") parts.push(content.text);
      if (typeof content?.output_text === "string") parts.push(content.output_text);
    });
  });
  return parts.join("").trim();
}

function parseResponseJson(text) {
  try {
    return JSON.parse(text || "{}");
  } catch (error) {
    const match = String(text || "").match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw error;
  }
}

function estimateOpenAiCost(usage, model, env) {
  const rateEntry = Object.entries(OPENAI_PRICING_PER_1M)
    .find(([name]) => model === name || model.startsWith(`${name}-`));
  const rates = rateEntry?.[1] || null;
  const inputTokens = Number(usage?.input_tokens || usage?.prompt_tokens || 0);
  const outputTokens = Number(usage?.output_tokens || usage?.completion_tokens || 0);
  const cachedTokens = Number(
    usage?.input_tokens_details?.cached_tokens ||
    usage?.prompt_tokens_details?.cached_tokens ||
    0
  );
  const billableInputTokens = Math.max(0, inputTokens - cachedTokens);
  const usdKrwRate = Number(env.USD_KRW_RATE || DEFAULT_USD_KRW_RATE);

  if (!rates) {
    return {
      available: false,
      model,
      inputTokens,
      cachedTokens,
      outputTokens,
      usd: null,
      krw: null,
      note: "No local pricing table for this model. Check OpenAI billing for the final cost."
    };
  }

  const usd =
    (billableInputTokens / 1_000_000) * rates.input +
    (cachedTokens / 1_000_000) * rates.cachedInput +
    (outputTokens / 1_000_000) * rates.output;

  return {
    available: true,
    model,
    inputTokens,
    cachedTokens,
    outputTokens,
    usd: Number(usd.toFixed(8)),
    krw: Number((usd * usdKrwRate).toFixed(2)),
    usdKrwRate,
    note: "Estimated from OpenAI usage tokens and the local pricing table; final billing can differ by account settings, model changes, or official price changes."
  };
}

async function handleExtractTrades(request, env) {
  const workerColo = String(request?.cf?.colo || "");
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({
      ok: false,
      error: "openai_key_missing",
      message: "OPENAI_API_KEY is not configured on the Worker.",
      workerColo
    }, 500, { "Cache-Control": "no-store" });
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    throw requestError("invalid_json");
  }

  const images = sanitizeImages(body?.images);
  const model = String(env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
  const detail = String(env.OPENAI_IMAGE_DETAIL || "high").trim();
  const content = [
    { type: "input_text", text: buildExtractPrompt(body?.knownTickers) }
  ];

  images.forEach((image) => {
    content.push({ type: "input_text", text: `Source file: ${image.name}` });
    content.push({ type: "input_image", image_url: image.imageUrl, detail });
  });

  const openAiResponse = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [{ role: "user", content }],
      text: {
        format: {
          type: "json_schema",
          name: "isa_trade_extract",
          strict: true,
          schema: getExtractSchema()
        }
      }
    })
  });

  const rawText = await openAiResponse.text();
  let openAiPayload = null;
  try {
    openAiPayload = JSON.parse(rawText || "{}");
  } catch (_) {
    openAiPayload = { raw: rawText };
  }

  if (!openAiResponse.ok) {
    return jsonResponse({
      ok: false,
      error: "openai_request_failed",
      status: openAiResponse.status,
      message: String(openAiPayload?.error?.message || openAiPayload?.message || "OpenAI request failed"),
      workerColo
    }, 502, { "Cache-Control": "no-store" });
  }

  const responseText = extractResponseText(openAiPayload);
  const parsed = parseResponseJson(responseText);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map(String) : [];
  const responseModel = String(openAiPayload?.model || model);
  const usage = openAiPayload?.usage || {};

  return jsonResponse({
    ok: true,
    model: responseModel,
    items,
    warnings,
    usage,
    costEstimate: estimateOpenAiCost(usage, responseModel, env),
    workerColo
  }, 200, { "Cache-Control": "no-store" });
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

    if (request.method === "POST" && url.pathname === "/extract-trades") {
      try {
        return await handleExtractTrades(request, env);
      } catch (error) {
        return jsonResponse({
          ok: false,
          error: "extract_trades_failed",
          message: String(error?.message || error)
        }, Number(error?.status || 500), { "Cache-Control": "no-store" });
      }
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
