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
    "You extract Korean ISA brokerage transaction history from KakaoPay Securities (카카오증권) screenshots.",
    "Return only actual executed transaction rows. Ignore holdings, portfolio balances, quotes, recommendations, and totals unless they are transaction rows.",
    "The user may upload TWO DIFFERENT kinds of screenshots together, and you must COMBINE them into one clean list of transactions:",
    "  (A) 주문내역 (Order history): rows like '종목명 / N주 구매 완료' or 'N주 판매 완료' with '주당 X원'. This gives the exact PER-SHARE price plus the side (구매=buy, 판매=sell) and share count. It usually shows only a coarse date header (e.g. '2026년 6월 22일') and NO precise time.",
    "  (B) 계좌내역 (Account ledger): timestamped rows 'M월 D일 HH:MM:SS'. Row kinds: stock delivery legs ('…매수입고 +N주' = a buy, '…-N주 출고' or '…매도출고' = a sell) give ticker+shares+side+timestamp; trade cash legs ('…국내주식구매 -원' or '…국내주식판매 +원'); cash deposits ('ISA납입금 …', or a person-name bank transfer like '홍길동(카카오뱅크1234) +원'); dividends/distributions (a fund name with '+원 입금'); and deposit interest ('정기 예탁금 수익 +원').",
    "MERGE RULES — emit exactly ONE item per real event, never double-count:",
    "For each executed stock trade, output a single item: take the exact PER-SHARE price from the matching 주문내역 row, and take the DATE and TIME from the matching 계좌내역 stock delivery leg. Match a 주문내역 order to a 계좌내역 leg by the SAME ticker + SAME share count + SAME side (buy/sell).",
    "If a trade appears only in 주문내역 (no matching ledger leg), keep its per-share price and leave time empty. If a trade appears only in 계좌내역 (no 주문내역 price), compute per-share price as (that trade's 국내주식구매/판매 cash-leg amount ÷ shares) and use the leg's timestamp.",
    "NEVER emit the 계좌내역 '국내주식구매' / '국내주식판매' cash legs as their own transactions — they are only the cash side of a trade you already output.",
    "For stock trades: side must be buy or sell, category must be \"0\", shares is positive quantity, and price is per-share execution price.",
    "Korean side cues are strict and override all other hints. If the same row contains 매도, 매도체결, 매도주문, 매도금액, 팔기, 판매, sell, sold, or sale, side MUST be \"sell\" and MUST NOT be \"buy\" or \"unknown\".",
    "If the same row contains 매수, 매수체결, 매수주문, 매수입고, 사기, 구매, buy, bought, or purchase, side MUST be \"buy\" and MUST NOT be \"sell\" or \"unknown\".",
    "Never default an unclear stock trade to buy. Use \"unknown\" only when no buy/sell/deposit/dividend side cue is visible in the transaction row; lower confidence and add a warning.",
    "For cash deposits (ISA납입금, 입금, incoming bank transfers showing a person/bank name): side must be deposit, ticker must be DEPOSIT, shares must be 1, price is the cash amount in 원, category is \"1\" unless the row explicitly says special/bonus, then category \"2\".",
    "For dividends, distributions, and deposit interest (정기 예탁금 수익, or a fund name with '+원 입금'): side must be dividend, shares must be 1, price is the amount in 원, category must be \"3\". Use the underlying ticker/name if visible; otherwise ticker DEPOSIT and add a warning.",
    "Use YYYY-MM-DD dates; infer the year from the nearest visible '____년' date header. If a core field is missing, leave an empty string or 0 and lower confidence. Never invent unseen exact numbers.",
    "For time: if the row shows an execution time, return it as 24-hour HH:MM:SS (or HH:MM if seconds are not shown). Convert Korean 오전/오후 (AM/PM) correctly: 오후 2:30 -> 14:30, 오전 12:05 -> 00:05. If no time is visible for the row, return an empty string. Never invent a time.",
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
