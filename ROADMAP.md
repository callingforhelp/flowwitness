# Roadmap

[简体中文](ROADMAP.zh-CN.md)

The local alpha now implements the core runtime. A hosted authenticated pilot
backend is available for sponsor review, while the public Pages concept demo
remains simulated. External pilots and production certification are still
unverified.

## Foundation — delivered in this repository

- [x] Public project definition and evidence-linked desk research
- [x] Stage boundaries and pilot success criteria
- [x] Proposed workflow and query examples
- [x] MIT license, contribution policies and static project site source

## Stage 1 — the pilot core

Stage 1 is the product we should put in front of an adopter. It is the
change-to-answer loop: a builder records a workflow, a browser check produces
evidence, a change flags stale guidance, and an existing support chat can ask
for the current published answer.

| Order | Work item | Completion evidence |
| --- | --- | --- |
| 1 — implemented | Workflow format and local CLI: init, validate, list | Reject dangling IDs, missing outcome/version and private artifacts; round-trip three synthetic flows |
| 2 — explicit records and real replay implemented | Capture and replay on a seeded local web fixture | A flow passes; move its button and assert failure; approve repair and assert success; retain step evidence |
| 3 — implemented | Git impact and deployment binding | Changed source flags the linked flow; shared auth flags all relevant flows; unrelated file doesn't; preview never overwrites production |
| 4 — implemented | Question queue and publication rules | One revision creates one deduplicated review item; unanswered questions prevent current publication |
| 5 — implemented, no vision | Headless query service and optional image intake | Known flow returns evidence; stale/unknown/wrong-role/ambiguous image returns safe non-answer or clarification |
| 6 — skill shipped, host smoke tests pending | Shared agent skill and guidance contract | Clean-install smoke test in one host, then separate Claude Code/Codex/pi compatibility receipts; no unsupported compatibility claims |
| 7 — pending | Pilot hardening | Three adopters, two release cycles, product metrics and private-data tests documented |

The Stage 1 backend surfaces are the workflow service, issues and messages,
the bilingual reasoning bank, agent registration and job leasing, local
durable storage, the module CLI, and the bilingual operator dashboard. These
are the only surfaces required for the first pilot.

The alpha uses Node.js 22+ ESM JavaScript, Git-friendly JSON, private artifact storage, Playwright and a native HTTP service. It does not require a TypeScript build step or a model key. Playwright provides repeatable assertions; evaluate Stagehand as an optional semantic locator/recovery adapter. A local tool named sagehand is not itself a portable dependency contract.

Stage 2 modules are already separated in the local service so they can be
tested without changing the Stage 1 loop. They include approved preview/test
reproduction and private FFmpeg video editing. They remain pilot-gated: no E2B
browser provider, customer-facing video delivery, or automatic customer
computer control is enabled by default.

Stage 1 release gate: the complete record → change → reverify → query loop works for a real pilot deployment, privacy boundaries hold, and the measurements in [PRODUCT.md](docs/PRODUCT.md) are reported. Local fixtures alone do not establish pilot readiness.

Automatic capture/discovery, logged-in session adapters, public hosting and a real three-builder pilot remain open. See [validation evidence](docs/VALIDATION.md).

## Stage 2 — assistive experiments after the first loop earns continued use

1. **Walkthrough delivery:** validate the existing private FFmpeg studio, configure a renderer/font, and add customer-facing delivery and optional narration. Reuse videos by workflow/version/role instead of generating one for every query.
2. **Preview reproduction:** connect the existing bounded reproduction module to an approved E2B or equivalent browser adapter, then test permissions, failed network, feature flags and recovery paths.
3. **Richer screenshot/photo assistance:** evaluate cropped, blurred, localized and outdated screens; role and release ambiguity must remain explicit.
4. **Customer-side computer use:** convert guidance into adapter-specific action plans with preconditions, confirmation points, cancellation and verified completion. Test real host protocols separately.
5. **Native integrations and visual maps:** host-specific lifecycle hooks, an optional MCP wrapper, and Archify export only if maintainers need relationship inspection.

Stage 2 priorities are provisional. Prefer the feature most often needed to resolve observed pilot failures. Do not add billing, a chat UI, a marketplace, a graph database, always-running customer browsers or generic autonomous website repair. Stage 2 code stays in separate modules; deferring a stage does not delete it.
