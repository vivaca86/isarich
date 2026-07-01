import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_OPENAI_MODEL = "gpt-5.4-nano";
const DEFAULT_USD_KRW_RATE = 1557;
const MAX_EXTRACT_IMAGES = 8;
const MAX_IMAGE_DATA_URL_CHARS = 8_000_000;
const OPENAI_PRICING_PER_1M = {
  "gpt-5.4-nano": { input: 0.20, cachedInput: 0.02, output: 1.25 },
  "gpt-5.4-mini": { input: 0.75, cachedInput: 0.075, output: 4.50 },
  "gpt-5.4": { input: 2.50, cachedInput: 0.25, output: 15.00 },
  "gpt-5.5": { input: 5.00, cachedInput: 0.50, output: 30.00 }
};

function setCors(res) {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Cache-Control", "no-store");
}

function sendJson(res, status, payload) {
  setCors(res);
  res.status(status).json(payload);
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
      if (!ticker && !name) return null;
      return { ticker: ticker.slice(0, 24), name: name.slice(0, 80) };
    })
    .filter(Boolean);
}

function buildKnownTickerHint(rawTickers) {
  const tickers = sanitizeKnownTickers(rawTickers);
  if (!tickers.length) return "No app ticker list was provided.";
  return tickers
    .map((item) => `${item.ticker || "-"}: ${item.name || "-"}`)
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
          required: [
            "date",
            "ticker",
            "name",
            "shares",
            "price",
            "side",
            "category",
            "sourceFile",
            "confidence",
            "memo"
          ]
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

function estimateOpenAiCost(usage, model) {
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
  const usdKrwRate = Number(process.env.USD_KRW_RATE || DEFAULT_USD_KRW_RATE);

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

async function callOpenAi(body, apiKey) {
  const images = sanitizeImages(body?.images);
  const model = String(process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
  const detail = String(process.env.OPENAI_IMAGE_DETAIL || "high").trim();
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
      Authorization: `Bearer ${apiKey}`,
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
    return {
      status: 502,
      payload: {
        ok: false,
        error: "openai_request_failed",
        status: openAiResponse.status,
        message: String(openAiPayload?.error?.message || openAiPayload?.message || "OpenAI request failed"),
        region: "us-central1"
      }
    };
  }

  const responseText = extractResponseText(openAiPayload);
  const parsed = parseResponseJson(responseText);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const warnings = Array.isArray(parsed?.warnings) ? parsed.warnings.map(String) : [];
  const responseModel = String(openAiPayload?.model || model);
  const usage = openAiPayload?.usage || {};

  return {
    status: 200,
    payload: {
      ok: true,
      model: responseModel,
      items,
      warnings,
      usage,
      costEstimate: estimateOpenAiCost(usage, responseModel),
      region: "us-central1"
    }
  };
}

export const extractTrades = onRequest(
  {
    region: "us-central1",
    timeoutSeconds: 120,
    memory: "512MiB",
    maxInstances: 3,
    secrets: [OPENAI_API_KEY]
  },
  async (req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method_not_allowed" });
      return;
    }

    const apiKey = OPENAI_API_KEY.value();
    if (!apiKey) {
      sendJson(res, 500, {
        ok: false,
        error: "openai_key_missing",
        message: "OPENAI_API_KEY is not configured for Firebase Functions.",
        region: "us-central1"
      });
      return;
    }

    try {
      const result = await callOpenAi(req.body, apiKey);
      sendJson(res, result.status, result.payload);
    } catch (error) {
      sendJson(res, error.status || 500, {
        ok: false,
        error: error.message || "extract_failed",
        region: "us-central1"
      });
    }
  }
);
