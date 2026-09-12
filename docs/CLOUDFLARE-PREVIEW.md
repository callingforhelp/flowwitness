# Cloudflare preview

[简体中文](CLOUDFLARE-PREVIEW.zh-CN.md)

This repository includes a small Cloudflare Worker for a public, non-static
concept preview. It serves the existing bilingual site through Workers Static
Assets and adds two read-only edge routes:

**Live preview:** [flowwitness-preview.dave-z.workers.dev](https://flowwitness-preview.dave-z.workers.dev/)

- `GET /api/health` returns a fresh runtime receipt.
- `GET /api/preview?release=v1|v2` returns the bilingual demo state used by the
  page. `v2` deliberately reports `needs_review` so the old answer is not
  presented as current guidance.

The Worker is a sponsor-facing preview surface. It is not the FlowWitness
backend: it does not run Chromium, store private artifacts, accept customer
credentials, run FFmpeg, or expose the authenticated support endpoint. The
full Node service remains the local/self-hosted runtime described in
[`OPERATIONS.md`](OPERATIONS.md).

## Deploy

Wrangler reads [`wrangler.jsonc`](../wrangler.jsonc). Keep the Wrangler OAuth
credential in its local config; never put it in this repository or in a Worker
variable. After `npx wrangler login` on a new machine:

```sh
npx wrangler deploy --config wrangler.jsonc
```

The command prints the temporary `workers.dev` URL. Verify it without sending
customer data:

```sh
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/health"
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/preview?release=v1"
curl --fail "$FLOWWITNESS_PREVIEW_URL/api/preview?release=v2"
```

The current preview URL is shown above for convenience. Treat it as a
non-production demo address; it can change if the Worker is renamed or removed.

`workers_dev` is enabled for this preview. A custom hostname, production
backend, private storage binding, or customer authentication requires a
separate deployment decision and is not implied by this file. To remove this
preview, an operator can run `npx wrangler delete flowwitness-preview` after
checking the target account.

## Evidence boundary

The edge response proves that the Worker is reachable and that the page can
read dynamic state. It does not prove the Stage 1 browser workflow or any
Stage 2 VM/video/computer-use integration. Those claims still require the
receipts in [`VALIDATION.md`](VALIDATION.md) and [`ADVERTISED-PROMISES.md`](ADVERTISED-PROMISES.md).
