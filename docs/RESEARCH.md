# Research and feature priorities

[简体中文](RESEARCH.zh-CN.md) · Desk research checked September 12, 2026.

## What the evidence does and does not establish

Public user discussions show documentation maintenance pain. Vendor documentation shows existing alternatives and feasible integration surfaces. Neither proves demand for FlowWitness, willingness to maintain workflow records, willingness to pay, or product-market fit. No customer interviews or pilots have been conducted for this project. Priorities below are reasoned hypotheses to test.

## Evidence ledger

| Evidence | Observation | Implication and confidence |
| --- | --- | --- |
| [Intercom community: keeping FAQs accurate across releases](https://community.intercom.com/knowledge-base-6/how-do-you-keep-your-faq-and-knowledge-base-accurate-releases-after-releases-7754) | Practitioners discuss release-driven maintenance and manual review of outdated content | Direct qualitative signal for freshness; small self-selected sample, not market sizing |
| [Technical writing discussion: maintaining screenshot-heavy docs](https://www.reddit.com/r/technicalwriting/comments/1urqhka/keeping_screenshotheavy_docs_current_especially/) | Users describe screenshot maintenance after UI changes; the discussion includes native apps | Supports maintenance hypothesis; do not infer that a browser-only product solves native-app needs |
| [Scribe official introduction](https://support.scribehow.com/hc/en-us/articles/8951146003741-New-User-Guide) | Recording a process produces screenshot-based instructions | Guide creation already has capable alternatives; recording alone is a weak differentiation |
| [Intercom Knowledge Hub](https://www.intercom.com/helpdesk/knowledge-hub) | Existing support software centralizes knowledge and controls answer-source availability | Integrate as a source of verified workflow guidance; avoid rebuilding a helpdesk |
| [Archify](https://github.com/tt-a1i/archify) | Typed representations, explicit relationships and evidence-linked views support inspecting a map | Reuse design principles; diagram validity must not be confused with workflow execution proof |
| [Stagehand](https://docs.stagehand.dev/) and [Browserbase browser sessions](https://docs.browserbase.com/platform/browser/getting-started/using-browser-session) | Browser automation and recording are available building blocks | Evaluate a browser adapter; no need to build a browser cloud in Stage 1 |
| [Playwright videos](https://playwright.dev/docs/videos) | Browser runs can retain video artifacts | Recording is feasible; editing, narration, privacy and helpfulness are separate product work |
| [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture) | Tools and context are exposed through a protocol | Useful transport option; not a universal computer-use action language |
| [Claude Code plugins](https://code.claude.com/docs/en/plugins), [hooks](https://code.claude.com/docs/en/hooks), [pi coding agent](https://github.com/earendil-works/pi/tree/main/packages/coding-agent) | Agent hosts offer extension mechanisms with differing contracts | Share domain logic; validate each native adapter independently |

## Alternatives and proposed differentiation

| Approach | Already good at | FlowWitness hypothesis |
| --- | --- | --- |
| Scribe-style capture | Turning a demonstrated process into a guide | Keep a guide bound to the application release and tested outcome |
| Knowledge-base support AI | Finding and phrasing answers from supplied material | Supply a small set of verified operational instructions with explicit freshness |
| Browser testing | Detecting observable regressions | Turn reviewed successful steps into customer-facing guidance |
| Visual relationship maps | Showing authored links and changes | Use links to schedule revalidation; do not infer correctness from reachability |
| Handwritten release checklist | Low setup cost and human judgment | Save enough repeated maintenance effort to justify integration |

This is not an exhaustive competitor audit. There is no evidence here that no competitor has similar features. Avoid claiming novelty, superiority or quantified support savings before a comparative pilot.

## Priority decisions

**P0: version and role correctness.** A beautifully phrased instruction for the wrong release is still wrong. Explicit metadata and abstention must precede richer generation.

**P0: three to five important workflows.** Start with repeated support tasks such as exports, project setup or team settings using seeded test data. Avoid payments/deletion as initial replay scenarios.

**P0: impact and replay.** Target the maintenance problem directly. Source links are reviewable hints and must include unknown-coverage handling.

**P0: a headless query API.** Customers keep their existing chat. Text plus optional image reference enters the contract; ambiguous images ask a clarifying question. Do not block the first useful version on general vision accuracy.

**P1: a shared skill and agent-readable response.** Give builders a common command surface. Native plugin automation and customer action execution require separate compatibility work.

**P2: polished video and agent teams.** Add only if pilots show that verified text/screenshots are insufficient or a bounded single queue cannot handle demand.

## Pilot protocol

Recruit three independent builders through voluntary participation; do not collect real customer screenshots in public issues. Each brings three recurring workflows, two recent UI changes and their current workaround. Ask for concrete examples before presenting the solution.

Questions: When did a guide last become wrong? Who noticed? How much time did repair take? What role/feature-flag context changed the answer? Would you maintain three small workflow records? What would make you disable this after a week?

Use a local seeded fixture first, then consented preview deployments. Seed UI changes, permission differences and ambiguous screenshots. Measure false alerts, wrong or stale answers, setup time, maintenance time, repeat use and query latency against the current process. Publish anonymized aggregate results with failures. See [PRODUCT.md](PRODUCT.md) for explicit target thresholds.

## One-maintainer open source setup

Follow [GitHub's open source project guide](https://opensource.guide/starting-a-project/) with a clear README, contribution guidance, conduct policy and explicit maintenance status. Use a static [GitHub Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for the public demo and docs; it does not host the future API.

Choose [MIT](https://choosealicense.com/licenses/mit/) for this small project's permissive reuse goals. Preserve notices when copying third-party code. No sponsorship, hosted-service SLA, trademark clearance or external-provider credits are implied. A limited name search found no obvious same-name developer product, but is not legal clearance.

## What support could unlock

A concrete first contribution of engineering time or coding-agent credits would support one local end-to-end fixture: author a workflow, mutate its UI, detect staleness, replay, and return verified guidance through a local API. Show tests, failure cases and measured cost before asking for a larger effort. Subsequent support could fund a three-builder pilot. No sponsor or partner has committed to this project.
