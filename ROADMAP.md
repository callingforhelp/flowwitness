# Roadmap

[简体中文](ROADMAP.zh-CN.md)

Except for the browser-local interactive demo, all runtime features below are **planned**, not shipped. Order expresses dependencies, not promised dates.

## Foundation — delivered in this repository

- [x] Public project definition and evidence-linked desk research
- [x] Stage boundaries and pilot success criteria
- [x] Proposed workflow and query examples
- [x] MIT license, contribution policies and static project site source

## Stage 1 — verified guidance for a few critical web workflows

| Order | Work item | Completion evidence |
| --- | --- | --- |
| 1 | Workflow format and local CLI: init, validate, list | Reject dangling IDs, missing outcome/version and private artifacts; round-trip three synthetic flows |
| 2 | Capture and replay on a seeded local web fixture | A flow passes; move its button and assert failure; approve repair and assert success; retain step evidence |
| 3 | Git impact and deployment binding | Changed source flags the linked flow; shared auth flags all relevant flows; unrelated file doesn't; preview never overwrites production |
| 4 | Question queue and publication rules | One revision creates one deduplicated review item; unanswered questions prevent current publication |
| 5 | Headless query service and optional image intake | Known flow returns evidence; stale/unknown/wrong-role/ambiguous image returns safe non-answer or clarification |
| 6 | Shared agent skill and guidance contract | Clean-install smoke test in one host, then separate Claude Code/Codex/pi compatibility receipts; no unsupported compatibility claims |
| 7 | Pilot hardening | Three adopters, two release cycles, product metrics and private-data tests documented |

Start with Node/TypeScript, Git JSON files, a local artifact directory, one browser adapter and a small HTTP service. Confirm exact supported runtime versions when implementation begins. Use Playwright for repeatable assertions; evaluate Stagehand as an optional semantic locator/recovery adapter. A local tool named sagehand is not itself a portable dependency contract.

Stage 1 release gate: the complete record → change → reverify → query loop works for a real pilot deployment, privacy boundaries hold, and the measurements in [PRODUCT.md](docs/PRODUCT.md) are reported. Local fixtures alone do not establish pilot readiness.

## Stage 2 — only after the first loop earns continued use

1. **Short walkthrough videos:** assemble a successful replay into captioned steps, then optional narration. Share expiring artifacts. Raw browser video is not an edited tutorial. Reuse by workflow/version/role instead of generating a video for every query.
2. **Richer screenshot/photo assistance:** evaluate cropped, blurred, localized and outdated screens; role and release ambiguity must remain explicit.
3. **Customer-side computer use:** adapter-specific action plans with preconditions, expected observations, pause/confirmation points, cancellation and verified completion. Test real host protocols separately.
4. **Expanded sandbox scenarios:** permissions, failed network, feature flags and recovery paths; a bounded work queue and budgets before multiple specialized agents.
5. **Native integrations and visual maps:** host-specific lifecycle hooks, optional MCP wrapper, and Archify export if maintainers need relationship inspection.

Stage 2 priorities are provisional. Prefer the feature most often needed to resolve observed pilot failures. Do not add billing, a chat UI, a marketplace, a graph database, always-running customer browsers or generic autonomous website repair.
