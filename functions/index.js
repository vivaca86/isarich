import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");

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
            time: { type: "string" },
            ticker: { type: "string" },
            name: { type: "string" },
            shares: { type: "number" },
            price: { type: "number" },
            side: { type: "string", enum: ["buy", "sell", "deposit", "dividend", "unknown"] },
            docType: { type: "string", enum: ["order", "ledger", ""] },
            category: { type: "string", enum: ["0", "1", "2", "3"] },
            sourceFile: { type: "string" },
            confidence: { type: "number" },
            memo: { type: "string" }
          },
          required: [
            "date",
            "time",
            "ticker",
            "name",
            "shares",
            "price",
            "side",
            "docType",
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
    "You extract Korean ISA brokerage transaction rows from KakaoPay Securities (카카오증권) screenshots.",
    "Extract EVERY transaction row you can see, each as its own item. DO NOT merge, combine, reconcile, or de-duplicate rows across screenshots — read each row exactly as shown. A separate program combines them afterwards.",
    "Ignore holdings totals, portfolio balances, quotes, and recommendations unless they are actual transaction rows.",
    "Set docType for every item: \"order\" if the row comes from a 주문내역 (order history) screen (shows '구매 완료'/'판매 완료' and a '주당 X원' price); \"ledger\" if it comes from a 계좌내역 (account ledger) screen (each row stamped 'M월 D일 HH:MM:SS').",
    "From a 주문내역 (order) screen, output one item per order: docType \"order\", side buy (구매) or sell (판매), category \"0\", shares = the share count, price = the '주당' per-share amount, time = \"\" (order screens show no execution time). Read EVERY row precisely; never skip a row or conflate similar product names.",
    "From a 계좌내역 (ledger) screen, output: (a) stock delivery legs — '…매수입고 +N주' is a buy, '…-N주 출고' or '…매도출고' is a sell — as docType \"ledger\", side buy/sell, shares = the share count, price = 0, plus the row's date and time; and (b) the cash rows described below.",
    "CRITICAL: OMIT trade cash-settlement legs entirely. A ledger row that shows a stock/fund name with a 원 cash amount (입금 or 출금) but NO share count — e.g. '…국내주식구매 -원', '…국내주식판매 +원' — is the cash side of a trade already captured by its delivery leg. Do NOT output such rows at all: not as a trade, not as a deposit, not as \"unknown\". Skip them completely.",
    "IMPORTANT: KODEX 미국나스닥100 (a plain index ETF) and TIGER 미국나스닥100 타겟데일리커버드콜 (a covered-call ETF) are DIFFERENT products — never merge or swap them. Match each visible name to the closest known ticker.",
    "Korean side cues are strict and override all other hints. If a row contains 매도, 매도체결, 매도출고, 팔기, 판매, sell, sold, or sale, side MUST be \"sell\". If a row contains 매수, 매수체결, 매수입고, 사기, 구매, buy, bought, or purchase, side MUST be \"buy\".",
    "Never default an unclear stock trade to buy. Use \"unknown\" only when no buy/sell/deposit/dividend side cue is visible; lower confidence and add a warning.",
    "For cash deposits on a ledger screen (ISA납입금, 입금, incoming bank transfers showing a person/bank name): docType \"ledger\", side deposit, ticker DEPOSIT, shares 1, price = the cash amount in 원, category \"1\" unless the row explicitly says special/bonus then \"2\", plus the row's date and time.",
    "For dividends, distributions, and deposit interest on a ledger screen (정기 예탁금 수익, or a fund name with '분배금'/'배당' and '+원 입금' — treat it as a dividend even if the fund name is truncated, e.g. shows 'ET…', as long as it is a '+원 입금' that is NOT a '국내주식판매' cash leg): docType \"ledger\", side dividend, shares 1, price = the amount in 원, category \"3\", plus date and time. Use the underlying ticker/name if visible; otherwise ticker DEPOSIT.",
    "Use YYYY-MM-DD dates; infer the year from the nearest visible '____년' header. For ledger rows return time as 24-hour HH:MM:SS (convert 오전/오후: 오후 2:30 -> 14:30, 오전 12:05 -> 00:05); order rows have time \"\". If a field is missing leave an empty string or 0 and lower confidence. Never invent unseen numbers.",
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
