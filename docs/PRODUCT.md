# Product definition

[简体中文](PRODUCT.zh-CN.md)

Status: proposed Stage 1, September 12, 2026.

## One sentence

FlowWitness maintains a small set of verified customer workflows alongside a web application's code and serves the right instructions to people and their agents.

## First user and job

Primary adopter: a solo SaaS builder who ships UI changes frequently, owns support, and can supply a preview URL and seeded test account. End user: a customer stuck completing a known task. Secondary adopter: a small support team collaborating directly with engineering.

When I ship a UI change, tell me which customer instructions may now be wrong, verify the affected flows, and make the corrected steps available to my existing support channel.

Do not start with enterprise knowledge ingestion, desktop applications, or autonomous account repair. Those multiply integrations before the central benefit is demonstrated.

## The smallest complete loop

Illustrative task: export a report. The builder records the report page, role requirement, export action, and expected download. A release moves Export into a menu. The file-to-step relationship marks the workflow stale. Replay against the matching preview initially fails, so current support queries return a clarification or unavailable result, not the old button location. The builder approves the corrected steps; replay succeeds; a published release binding makes the new guide eligible for customers on that release.

A source push is not a deployment. Preview evidence must not silently replace a production guide. Keep the last verified guide for each deployed version; invalidate the affected version only when its actual UI/context has changed or its evidence has expired.

## Stage 1 functional requirements

- Explicit opt-in capture of named workflows; initially accept human/agent-authored records and a Playwright-compatible capture path. No background recording of unrelated activity.
- Stable step IDs, role and plan prerequisites, expected outcomes, route/source links, application version and evidence provenance.
- Changed-file impact analysis with honest coverage: a dependency edge means possibly affected, not guaranteed broken. Unmapped changes produce a review-needed warning; shared layout/auth/config changes trigger broad revalidation.
- Isolated browser replay against a configured, allowlisted test deployment; fail closed if release identity cannot be established. Deterministic assertions are required alongside any model interpretation.
- Review queue of missing facts, deduplicated by workflow and revision. Batch questions after a push and in an optional scheduled digest; no agent swarm needed.
- Query endpoint usable by existing customer chats. Accept question, trusted application/release/role context and optional short-lived image reference. Identify a known workflow or ask for missing context. Scope access to the published customer-safe subset.
- Answers contain ordered steps, expected outcome, evidence references and verification time/version. Unknown, stale, failed, ambiguous and unauthorized requests cannot produce an actionable current answer.
- Return a versioned guidance object that an agent can read. Execution remains the customer's agent's responsibility and authority. No hidden clicks or credential transfer.

## Quality targets to validate, not current achievements

Pilot with three independent builders and at least three workflows each. Compare against their current help article/manual answer process.

- At least 80% of seeded relevant UI changes flag the right workflow, with no more than 20% irrelevant alerts.
- Zero seeded stale-version or cross-role cases yield a confident actionable answer.
- At least 8 of 10 held-out known-task questions resolve to the correct flow; ambiguous images trigger clarification.
- Median setup under 30 minutes for three flows; median weekly maintenance under 15 minutes per pilot application.
- Cached verified guidance p95 under 2 seconds in a documented local/load fixture; replay is asynchronous and never blocks the synchronous answer path.
- At least two of three pilot builders choose to keep it enabled after two release cycles.

If usefulness requires unrestricted crawling, frequent manual repair, or expensive replay of the whole application per push, reduce scope or revise the approach before Stage 2.

## Product boundaries

Real-time means fast retrieval of already verified guidance. New reproduction is a queued job with status; no promise of instant sandbox/video completion. A screenshot suggests screen identity but cannot prove permissions, feature flags, release, or user intent. Ask one discriminating question when needed.

No mandatory hosted service: planned CLI and headless service can run on the adopter's infrastructure, with model/browser provider choices behind adapters. An open source license does not make external inference or hosted browsers free.
