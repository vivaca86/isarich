# ISA RICH Cloudflare price cache setup

This is optional. The app still works through the existing Apps Script price URL when `config.js` has an empty `priceCacheUrl`.

## 1. Create a KV namespace

Cloudflare Dashboard -> Workers & Pages -> KV -> Create namespace

Suggested name:

```text
isarich-price-cache
```

Copy the namespace ID and put it in `wrangler.jsonc`:

```jsonc
"id": "REPLACE_WITH_KV_NAMESPACE_ID"
```

## 2. Deploy the Worker

Run from this repo:

```powershell
npx wrangler deploy
```

Then set the Apps Script source URL as a Worker secret:

```powershell
npx wrangler secret put PRICE_SOURCE_URL
```

Paste the existing Apps Script `/exec` URL when Wrangler asks for the value.

## 3. Connect the app to the Worker

After deploy, Wrangler prints a URL like:

```text
https://isarich-price-cache.<your-subdomain>.workers.dev
```

Put it in `config.js`:

```js
window.ISARICH_CONFIG = {
  priceCacheUrl: "https://isarich-price-cache.<your-subdomain>.workers.dev/prices"
};
```

## 4. Verify

Open:

```text
https://isarich-price-cache.<your-subdomain>.workers.dev/prices
```

It should return the same price JSON shape that the app currently receives from Apps Script.
