# FlowWitness

**Help your customers use what you built.**

[简体中文](README.zh-CN.md) · [PRD](docs/PRD.md) · [Hosted backend](docs/HOSTED-BACKEND.md) · [Production decision](docs/decisions/0001-shared-ec2-insforge-pilot.md) · [Public concept demo](https://callingforhelp.github.io/flowwitness/) · [Live Cloudflare preview](https://flowwitness-preview.dave-z.workers.dev/) · [Cloudflare preview notes](docs/CLOUDFLARE-PREVIEW.md) · [Pilot 01](docs/PILOT-01.md) · [Promise ledger](docs/ADVERTISED-PROMISES.md) · [Runbook](docs/OPERATIONS.md) · [API](docs/API.md) · [Research](docs/RESEARCH.md) · [Roadmap](ROADMAP.md)

FlowWitness is a self-hosted service with a temporary hosted pilot backend. It stores customer workflows and support issues, checks approved preview flows in Chromium, and serves explicitly published instructions to your existing support chat. When an application changes, test the old steps, inspect the failure, repair the workflow, and publish a new checked answer.

**The runtime is real.** It includes a CLI, HTTP service, bilingual operator dashboard, actual browser checks, private screenshots, and a support-query endpoint. The [hosted backend](docs/HOSTED-BACKEND.md) is reachable for sponsor review; the public GitHub Pages site remains a **separate simulated concept demo**.

## Run locally

Requires Node.js 22 or later, npm, and an installed Chromium browser for Playwright.

```sh
git clone https://github.com/callingforhelp/flowwitness.git
cd flowwitness
npm ci
npx playwright install chromium
npm start
```

Open **http://127.0.0.1:4310/app/**. No API key is needed for local mode. The service binds to loopback; use it only on a trusted local machine. Remote binding requires separate admin/support tokens. See the [runbook](docs/OPERATIONS.md).

1. Select **Set up demo workflow**.
2. Run a **browser check** and inspect its screenshots.
3. **Publish** the successful run.
4. Ask **How do I export a report?**
5. Under **Try an application change**, move the demo to v2. The old answer becomes unavailable; checking the old steps really fails against the changed page.
6. Repair the demo steps, check again, and publish the updated instructions.

The fixture uses synthetic report data, but the server, browser interaction, assertions, screenshots and API calls are real. No simulated verification result is used in the operator app.

## What works

- Validated workflow JSON with explicit steps, source paths, role and expected outcomes; CLI import/list/validate and Git-range impact checks.
- Persistent jobs, bounded one-at-a-time Chromium replay, deployment identity checks before and after execution, masked screenshots and expiring private image artifacts.
- Explicit publication: a passing check alone never makes instructions available to customers.
- Headless support queries return published steps, screenshot references and a structured guidance object, or clarification/unavailable status.
- Signed GitHub push intake and deduplicated review questions. A source push does not overwrite production deployment identity.
- English/Chinese dashboard, image upload with consent and metadata stripping, and separate admin/support credentials for authenticated mode.
- Scoped issues and messages, an evidence-linked bilingual reasoning bank, and lease-fenced investigation jobs for Claude Code, Codex and pi workers.
- A bounded preview/test reproduction module that can consume an injected VM/browser adapter and records unverified evidence receipts until an operator reviews them.
- A private FFmpeg video studio with trim, captions, logo, colors, highlights, narration mixing and expiring links; video output remains private until publication.
- Native server composition for all six modules with separate durable state and authenticated artifact-link delivery. Optional adapters are injected at startup; no model or hosted browser is required.
- A [shared coding-assistant skill](docs/AGENT-INTEGRATION.md), with host installation guidance.

## What to use first

**Stage 1** is the pilot path: issues and Q&A, the evidence-linked reasoning
bank, agent jobs and CLI, workflow verification, and the bilingual dashboard.
**Stage 2** stays available as separate modules: approved preview reproduction
and private walkthrough video editing. They require explicit adapters and do not
change the Stage 1 workflow-to-answer loop. Photo understanding, customer
computer use, native host hooks, Archify export and managed E2B remain
later integrations. The [external pilot checklist](docs/PILOT-ONBOARDING.md)
defines the first adopter's two-release evidence run.

## Honest limits

Workflows are explicitly authored or imported; automatic screen recording and code-to-workflow discovery are not implemented. Query matching uses configured question aliases, not an LLM. Images can be privately uploaded, but image recognition is not implemented. Initial replay targets trusted, operator-configured applications; it is not a sandbox for hostile code. Authenticated customer-session replay needs an additional adapter.

This is one application per service, with a single state writer. The hosted endpoint is a sponsor-review pilot: its authenticated API and InsForge state mirror are live, while the free 512 MB machine still cannot reliably run the Chromium page step. It is not production-certified or a multi-tenant hosted helpdesk. Customer computer-use execution, image understanding and generated voice remain future work. See [Stage 1 boundaries](ROADMAP.md), the [hosted backend checkpoint](docs/HOSTED-BACKEND.md), and the [composition notes](docs/COMPOSITION.md).

## CLI and integrations

```sh
node bin/flowwitness.mjs --help
node bin/flowwitness.mjs init
node bin/flowwitness.mjs list
node bin/flowwitness.mjs validate examples/workflow.json
node bin/flowwitness.mjs verify export-report
node bin/flowwitness.mjs query 'How do I export a report?'
```

Service commands require a running instance; `validate` is local. Set `FLOWWITNESS_URL` and, in authenticated mode, `FLOWWITNESS_TOKEN` in your private environment. No npm registry release has been published: use this checkout or a local package install.

## Checks

```sh
npm test
npm run test:integration
node scripts/check-dashboard.mjs
python3 scripts/check-system.py
```

The browser checks use temporary state and the bundled fixture. They demonstrate local behavior, not an external customer's deployment. Results and limits are in [VALIDATION.md](docs/VALIDATION.md).

## Contribute

Maintained by [@callingforhelp](https://github.com/callingforhelp). Useful contributions include a redacted recurring support task, a reproducible failing workflow, or a pilot on a non-sensitive preview application. Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [community conduct](CODE_OF_CONDUCT.md). No sponsor or partner has committed, and no response-time guarantee is offered.

[MIT](LICENSE). [Archify](https://github.com/tt-a1i/archify) inspired explicit relationships and evidence-linked representations; no Archify code is bundled. A relationship map does not replace execution proof.
