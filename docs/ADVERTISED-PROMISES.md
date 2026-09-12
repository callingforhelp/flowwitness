# Public promise ledger

[简体中文](ADVERTISED-PROMISES.zh-CN.md)

Updated September 12, 2026. This page is the sponsor and pilot handoff for
FlowWitness. It translates the public site and project description into
checkable claims. “Implemented locally” means the source and focused tests
exist in this repository. It does not mean a hosted service, external adoption,
or compatibility with an untested provider.

## Stage 1 — the promise a pilot can try now

| Earlier public promise | What exists in this repository | Status and evidence | Next gate |
| --- | --- | --- | --- |
| Keep customer workflows beside the application and notice UI changes. | Explicit workflow JSON, source relationships, Git-range impact checks, signed GitHub push intake, deduplicated review questions, real Chromium replay, and release-bound publication. | Implemented locally; [Pilot 01](PILOT-01.md) and the public-route [Pilot 02](PILOT-02.md) exercise publish → UI change → failed replay → repair → new publication across two releases. | Repeat the same loop on one adopter-owned, non-sensitive preview application. |
| Let a customer ask in the chat they already use. | `POST /v1/query` returns current published steps, expected outcomes, evidence references, locale, and deployment context, or a clarification/unavailable response. The existing chat remains the customer-facing UI. | Implemented locally and covered by the integration, API, and dashboard checks. | Connect one trusted support backend during the external pilot. |
| Give builders a Q&A and reasoning bank that improves over time. | Scoped issues/messages and a bilingual knowledge bank hold reports, hypotheses, observations, attempts, and resolutions. Evidence status and operator publication are explicit. | Implemented locally; customer and operator scopes are tested. Hidden chain of thought and credentials are never stored. | Measure whether the bank reduces repeated support work for the adopter. |
| Attach the workflow to Claude Code, Codex, or pi. | A shared skill and allowlisted module CLI support those runtimes; investigation jobs use registered capabilities, leases, heartbeats, and fencing. | Skill shipped; host-specific discovery and behavior receipts are still pending. There is no native plugin claim. | Run separate clean-install smoke checks in each host before claiming compatibility. |
| Offer English and Chinese from the start. | README, roadmap, product/API/runbook docs, public concept site, operator dashboard, workflow steps, and query responses have English/Chinese paths. | Implemented locally; the real dashboard check covers Chinese results and responsive layouts. | Review translations with a pilot user and add missing domain terminology. |
| Accept a customer screenshot or photo through the existing chat. | `POST /v1/images` requires consent, accepts PNG/JPEG/WebP, strips source metadata, stores a private expiring artifact, and lets the query endpoint receive its ID. | Intake is implemented locally. The image is not interpreted and cannot by itself produce instructions. | Evaluate image understanding only after a pilot shows that text and evidence are insufficient. |
| Keep sensitive evidence private. | Artifacts are scoped, hashed, expiring, revocable, and served through authenticated links. Browser captures use configured redaction selectors. | Implemented locally and checked through authenticated API and dashboard paths. | Test the adopter's redaction rules and retention policy. |

## Stage 2 — retained modules, deliberately separate

These features were part of the broader concept and remain in the repository.
They are not silently removed; they are behind explicit adapters and do not
change the Stage 1 workflow-to-answer loop.

| Earlier concept | Current boundary | What would unlock it |
| --- | --- | --- |
| Reproduce a customer issue in a VM or browser sandbox, including Sagehand/Stagehand-style interaction. | The reproduction module accepts an approved preview/test target, bounded actions, cancellation, cleanup, and unverified evidence receipts. No E2B or hosted browser adapter is configured. | An approved E2B or equivalent adapter plus a real preview target and abuse tests. |
| Generate and share a customer walkthrough video. | The private FFmpeg studio supports trim, captions, logo, colors, highlights, narration mixing, and expiring links. Render, publish, and customer reads revalidate live evidence; imported recordings remain unverified. | A configured renderer/font, a delivery policy, and pilot evidence that text/screenshots are not enough. |
| Let a computer-use agent help the customer directly. | Stage 1 returns instructions only. The guidance object includes preconditions and expected observations but never grants browser authority or transfers credentials. | A host-specific computer-use adapter with confirmation, cancellation, mismatch stop, and completion checks. |
| Have agents ask questions or update periodically after a GitHub push. | A signed push creates a scoped, deduplicated review queue. Registered workers can claim investigation jobs. There is no always-running agent swarm, native lifecycle hook, or hidden scheduled reasoning. | Pilot evidence for the cadence and cost, then an explicit digest/scheduler integration with operator controls. |
| Use relationship graphs or Archify linkage. | Explicit source/workflow/run/evidence relationships are stored; the graph endpoint exposes only those relationships. Archify code is not bundled and no graph database is required. | A maintainer need for relationship inspection after pilot use, followed by an optional export. |
| Offer a public customer-service endpoint or hosted cloud. | The authenticated Node/Playwright service is live for sponsor review at the [hosted backend](HOSTED-BACKEND.md), with InsForge-backed state and private artifact bytes; the [Cloudflare Worker preview](https://flowwitness-preview.dave-z.workers.dev/) remains a read-only concept surface. GitHub Pages remains a simulated concept demo. | The shared ARM64 EC2 route passes public synthetic browser verification, auth, image intake, state restart recovery and API paths through the named `flowwitness-pilot.useflinter.com` tunnel. The free 512 MB fallback still cannot create a Chromium page reliably. Production browser verification, tenancy, backup/alert operations and external adoption remain open. |

## The next pilot gate

The internal fixture pilot and public-route rehearsal are complete and
documented in [Pilot 01](PILOT-01.md) and [Pilot 02](PILOT-02.md). The next
useful step is one external workflow with no sensitive data:

1. The adopter supplies a preview URL or local application, a seeded test
   account, one customer task, its role, expected outcome, and the relevant
   source paths.
2. Release A is recorded, checked in Chromium, explicitly published, and
   queried through the adopter's support path.
3. Release B changes the UI. A signed push or complete local diff creates the
   review question; the old answer is withheld until the changed workflow is
   repaired, checked, and published.
4. We record setup time, false alerts, stale-answer safety, query latency,
   maintenance time, and whether the adopter would keep it enabled. These are
   the measures in [PRODUCT.md](PRODUCT.md), not marketing claims.

The adopter keeps control of the preview account and deployment. Do not place
credentials, customer screenshots, private URLs, or private evidence in this
repository. A sponsor can help most by supplying one pilot partner, reviewing
the bilingual experience, or funding an explicitly approved browser/renderer
adapter. No sponsor or partner commitment is implied by this request.

Until that gate is complete, FlowWitness should claim a working local alpha and
a hosted authenticated pilot backend with durable state, plus the internal
two-release receipt. It should not claim production browser verification,
external adoption, managed E2B, native host plugins, image recognition,
customer computer control, or customer-facing video delivery.
