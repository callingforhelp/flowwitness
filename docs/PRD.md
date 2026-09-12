# FlowWitness product requirements document

[简体中文](PRD.zh-CN.md)

**Status:** proposed product definition with an implementation audit
**Date:** September 12, 2026
**Owner:** FlowWitness maintainers

This document turns the product promises made in the design conversation into
independent, testable work. It is the current product source of truth. The
status column is an audit of the repository and live checks on the date above;
it is not a claim that every planned capability is already shipped.

## Problem statement

A solo SaaS builder changes a web interface faster than customer instructions
can be reviewed. Customers then ask the same “where is this button?” question
in a chat, while the builder has to remember which release, role and feature
flag the old answer described. Screenshots and an LLM answer alone cannot prove
that a step is still valid.

FlowWitness keeps a small set of named customer workflows beside application
code. A code change creates an impact review, an approved preview run produces
evidence, and an operator explicitly publishes the matching answer for an
existing support chat. The first user is a builder who can provide a
non-sensitive preview application and seeded test data; the customer and the
builder's coding agent consume the resulting records through separate scopes.

## Product promise

When a builder changes a UI, FlowWitness identifies potentially stale customer
workflows, asks for missing facts, checks the affected flow in an approved
preview, and makes only the verified, release-matched guidance available to the
existing customer channel. Optional reproduction, video and computer-use
adapters consume the same evidence and guidance contracts without being
required for the first loop.

## Goals and measures

These are launch hypotheses to measure during pilots, not current achievements.

1. **Protect answer correctness.** At least 80% of seeded relevant UI changes
   identify the right workflow, with no more than 20% irrelevant alerts; zero
   seeded stale-version or wrong-role cases return a confident current answer.
2. **Make maintenance small.** Three workflows can be configured in under 30
   minutes and weekly maintenance stays under 15 minutes per pilot application.
3. **Keep support retrieval fast.** Eight of ten held-out known-task questions
   resolve to the correct flow, cached guidance has p95 below two seconds in a
   documented fixture, and browser work remains asynchronous.
4. **Prove repeat use.** Three independent builders complete two release cycles
   with one non-sensitive workflow each; at least two choose to keep it enabled.
5. **Make the project reviewable.** The public repository, English/Chinese
   documentation and sponsor demo show the same boundaries as the runtime, with
   no credentials or private customer evidence committed.

## Non-goals for the first release

- A replacement chat/helpdesk UI. The existing customer chat calls the query
  endpoint.
- General website crawling, automatic recording of every screen, or autonomous
  repair of arbitrary applications.
- Vision-based answers from an uploaded photo. Intake and safe clarification
  come first; image understanding is a separate experiment.
- Automatic control of a customer's computer, credential transfer, or a claim
  of a universal computer-use protocol.
- A multi-tenant hosted helpdesk, billing system, marketplace, graph database,
  or always-running agent swarm.
- Payments, deletion, customer production profiles, or hostile-code sandboxing
  in the initial browser fixture.

## Release shape and independent workstreams

Stage 1 is the change-to-answer loop. Each workstream has an adapter boundary
and can be delivered or tested independently:

- **Records and CLI:** workflow JSON, validation, import/list and impact calls.
- **Change review:** source relationships, deployment identity, signed push
  intake and deduplicated questions.
- **Verification:** bounded browser execution, evidence artifacts and explicit
  publication.
- **Support and reasoning:** issues, messages, bilingual knowledge entries and
  the query contract.
- **Agent access:** registered Claude Code, Codex or pi capabilities, leased
  jobs and the portable skill/CLI.
- **Operator experience:** bilingual dashboard and clear failure states.
- **Hosting and operations:** authenticated service, durable state, private
  artifacts, restart recovery and pilot runbook.

Stage 2 modules remain separate. Reproduction consumes an issue, an approved
target and a job lease; it does not need the video module. Video consumes a
validated evidence bundle and artifacts; it does not need customer computer
control. Image understanding consumes an image artifact; it does not need
browser replay. Computer-use adapters consume the versioned guidance object;
they do not grant themselves publication authority. A graph export consumes
relationship records and does not require a graph database.

## Requirements and implementation audit

Status meanings:

- **Implemented:** source and focused tests or live evidence cover the stated
  behavior.
- **Partial:** a bounded local implementation exists, but an integration,
  hosted path or promised capability is still missing.
- **Blocked:** the design is implemented but an external capacity/provider gate
  prevents the acceptance check.
- **Not implemented:** only a contract, stub or research note exists.

### Foundation and sponsor surface

| ID | Priority | Requirement and acceptance condition | Current status and evidence | Remaining work |
| --- | --- | --- | --- | --- |
| FND-01 | P0 | Public GitHub repository, MIT license, contribution/security policy, reproducible Node runtime and CI. | **Implemented.** `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, public repository and GitHub Runtime checks are present. | Keep releases and dependency/security review current. |
| FND-02 | P0 | A clear bilingual project explanation and a friendly demo surface distinguish simulated concept UI from real operator/API behavior. | **Implemented as a demo.** GitHub Pages, Cloudflare preview, English/Chinese docs and hosted `/app/` link are live. | Review wording with a sponsor; do not present the Pages simulation as the backend. |

### Stage 1 pilot core

| ID | Priority | Requirement and acceptance condition | Current status and evidence | Remaining work |
| --- | --- | --- | --- | --- |
| S1-01 | P0 | A builder can author or import a workflow with stable step IDs, source paths, role/release context, expected outcome and safe actions; validation rejects unsafe or incomplete records. | **Implemented locally.** `flowwitness init`, `validate`, `import`, `list`, `serve` and module CLI paths exist; unit, lifecycle and CI checks pass. | Test clean-install behavior separately in each target host. Automatic capture is intentionally outside this row. |
| S1-02 | P0 | A complete Git range marks linked and shared workflows as possibly affected, reports unknown coverage, and a signed GitHub push is accepted only once and with a complete change set. | **Partial.** Impact analysis, source relationships, signature validation and deduplication are implemented locally; the public repository has a push-only hook, and two real GitHub delivery IDs are persisted by the hosted service alongside the signed synthetic dedupe check. | Document retry behavior and add an operator-controlled digest/scheduler only if pilot cadence requires it. |
| S1-03 | P0 | A verification run checks deployment identity before and after bounded browser actions, retains redacted private evidence, and only an explicit operator call can publish a current matching release. | **Partial: shared EC2 pilot passed.** Real Chromium release-A/release-B failure and repair, private evidence retrieval and explicit publication pass on the existing ARM64 shared host; the original free 512 MB Compute endpoint still cannot reliably create a page. The public-route receipt is in [Pilot 02](PILOT-02.md). | Keep the browser-capable runtime behind approved stable ingress, then repeat on an adopter-owned preview before production certification. |
| S1-04 | P0 | Missing facts create one review question per workflow/revision; operators resolve it before publication. Issues/messages and knowledge entries preserve concise bilingual provenance and never accept hidden chain of thought or credentials. | **Partial.** Legacy questions and the issues/knowledge modules are implemented with local tests and publication gates. The module runtime now uses the scoped InsForge adapter in hosted mode, and a configured support conversation can read/write its own module scope; scheduled summaries and a real support-chat integration are still absent. | Connect one real support chat and add scheduled summaries only if a pilot demonstrates the need. |
| S1-05 | P0 | An authenticated support backend can submit a question with trusted application/release/role context and receive current steps/evidence or clarification/unavailable; an image can be consented, normalized, private and expiring. | **Partial.** `/v1/query` and `/v1/images` are implemented; hosted auth/image/artifact checks pass. Images are not interpreted. | Connect one real support chat and evaluate image understanding only against measured pilot failures. |
| S1-06 | P0 | Claude Code, Codex and pi can use a portable skill/CLI; registered agents claim bounded jobs with capabilities, heartbeats, fencing and cancellation; no host receives implicit execution authority. | **Partial.** Skill, allowlisted module CLI, agent records and job lease logic have source and focused tests. | Run clean-install discovery and behavior receipts in all three hosts; add lifecycle hooks or an MCP wrapper only as explicit integrations. |
| S1-07 | P0 | The operator can set up, verify, inspect evidence, resolve questions, publish, query, induce a UI failure and repair it in English or Chinese at mobile and desktop widths. | **Implemented for local runtime and shared EC2 pilot UI.** Dashboard checks and [Pilot 02](PILOT-02.md) cover real API calls, screenshots, publication, failure/repair, locale and responsive layouts. | Run the same operator flow with an adopter-owned application and review terminology with the pilot owner. |
| S1-08 | P0 | A hosted HTTPS service provides separate admin/support auth, durable workflow state and private artifacts, restart recovery, retention, backups and operational health. | **Partial hosted pilot.** InsForge-backed legacy workflow state, Stage 1 module records and private module artifacts survive the shared EC2 Compute restart; authenticated health, setup, image, module, browser, publication and artifact checks pass. The scale-to-zero pilot showed one cold-start probe exceeding 15 seconds while succeeding within 60 seconds. Backups, alerts, a stable custom domain/TLS policy and multi-application operations are still open. | Run a backup/restore drill, measure startup and support-query latency, choose a keep-warm/capacity policy, add alerting and custom-domain operations, and decide retention/tenancy. |
| S1-09 | P0 | One adopter-owned, non-sensitive application completes release A → publish → UI change → stale suppression → repaired release B → support query, with setup, latency, false-alert and retention measurements. | **Not implemented.** Internal Pilot 01 and the public-route Pilot 02 rehearsal are complete, but both use FlowWitness's synthetic fixture; no external adopter has run the loop. | Recruit one pilot partner and repeat the two-release receipt with its preview target before claiming external or production readiness. |

### Stage 2 retained modules

| ID | Priority | Requirement and acceptance condition | Current status and evidence | Remaining work |
| --- | --- | --- | --- | --- |
| S2-01 | P1 | An approved preview/test issue can run in a fresh bounded VM/browser session, with approval binding, same-origin navigation, action/time limits, cancellation, cleanup and unverified evidence. | **Not implemented as a provider.** Reproduction module, lease contract and fake adapter tests exist; no E2B, Sagehand/Stagehand or equivalent hosted adapter is configured. | Select a provider, implement the adapter and run abuse, network, feature-flag and cleanup tests. |
| S2-02 | P1 | An operator can turn validated evidence into an English/Chinese walkthrough with trim, captions, highlights, logo, optional narration, private expiring delivery and explicit publication. | **Partial local module.** FFmpeg renderer and video module have focused fake/real tests and publication gates. | Configure a production renderer/font, connect evidence to a customer delivery path, and measure whether video solves a pilot problem. |
| S2-03 | P1 | A screenshot/photo can be cropped or localized and produce a cited hypothesis or a clarification without overriding release, role or evidence gates. | **Not implemented.** Upload and metadata normalization exist; no vision/model adapter exists. | Choose a privacy-reviewed model/provider and run held-out ambiguity and redaction tests. |
| S2-04 | P1 | A customer-controlled computer-use adapter receives versioned steps, preconditions and expected observations; it asks for confirmation, stops on mismatch, supports cancellation and reports verified completion. | **Not implemented.** Guidance JSON and safety contract exist; no native computer-use or universal protocol adapter is shipped. | Specify one host protocol and its authority/confirmation model; test against a disposable app. |
| S2-05 | P1 | A push can schedule an operator-visible digest and registered agents can periodically update investigations without an always-on swarm or hidden reasoning. | **Not implemented.** Queue, leases and signed push intake exist; there is no scheduler, digest worker or native lifecycle hook. | Prove cadence and cost in the external pilot before adding a scheduler. |
| S2-06 | P2 | Relationship data can be inspected and optionally exported to Archify-compatible representations without changing runtime truth. | **Partial.** The service exposes explicit workflow/source/run relationships through `/v1/graph`; Archify export is not bundled. | Confirm a maintainer need, define an export schema and add a read-only adapter. |
| S2-07 | P2 | More than one application can share hosted infrastructure with explicit tenant isolation, quotas, retention and operator roles. | **Not implemented.** The current service intentionally supports one application per instance. | Decide whether hosted multi-tenancy is needed after the pilot; do not add it before evidence of demand. |

## Production readiness gate

The phrase “production backend” is reserved for the following evidence:

- The hosted release-A/release-B browser loop passes on the selected compute or
  remote browser provider, including private screenshot retrieval and stale
  answer suppression. The shared ARM64 EC2 pilot now satisfies the synthetic
  browser check; its accountless quick tunnel is temporary and is not production
  ingress.
- Legacy workflow state **and** Stage 1 module records survive a replacement,
  with a tested backup/restore path and retention cleanup.
- A real support integration uses the support credential and conversation
  binding; a signed GitHub webhook is configured and replay-safe.
- Custom-domain/TLS, rate limits, alerting and an operator runbook are live.
- One external non-sensitive pilot completes two releases and reports the
  metrics above.
- Tenancy and data-retention decisions are written down before serving more
  than one application.

The current endpoint satisfies the authenticated API, browser-on-shared-EC2,
legacy state/artifact restart and basic health portions. It does not satisfy
stable production ingress, backup/restore, or the external-pilot portion, so it
must be described as a hosted pilot backend.

## Open questions

| Question | Owner | Blocking? |
| --- | --- | --- |
| Which stable browser runtime and ingress should production use after the shared EC2 pilot? | Stakeholder/operations | Yes for production certification |
| Which durable adapter should store module records: InsForge RPC tables, Postgres, or another approved store? | Engineering | Resolved for the pilot: InsForge scoped RPC; backup/restore is still required before production |
| Is one service per application acceptable for the first sponsor pilot? | Product/sponsor | Yes before inviting a second application |
| Which existing support chat supplies trusted conversation, role and release context? | Pilot integrator | Yes for customer query testing |
| What screenshot retention, redaction and model-processing policy is acceptable? | Product/legal | Yes before image understanding or external evidence |
| Does a pilot need video or computer-use help often enough to justify its provider cost? | Product/pilot | No for Stage 1; decides Stage 2 order |

## Sequencing

1. Keep S1-03 closed for the shared EC2 synthetic pilot and close the remaining
   S1-08 operations gates: stable ingress, backup/restore, alerting and policy.
2. Run S1-09 with one external non-sensitive workflow and record the metrics.
3. Complete S1-06 host smoke checks and S1-02 webhook/digest work only where the
   pilot shows recurring value.
4. Select one independent Stage 2 experiment based on observed failures:
   reproduction, video, image understanding or computer-use assistance.
5. Consider Archify export and multi-tenancy only after maintainers can point
   to a concrete inspection or adoption need.

## Evidence references

- [Product definition](PRODUCT.md) — original user/job, boundaries and metrics.
- [Roadmap](../ROADMAP.md) — staged work and pilot gate.
- [Advertised promise ledger](ADVERTISED-PROMISES.md) — public wording and
  evidence boundaries.
- [Hosted backend checkpoint](HOSTED-BACKEND.md) — live endpoint and remaining
  hosting gates.
- [External pilot checklist](PILOT-ONBOARDING.md) — the bilingual two-release
  run and evidence to collect from the first adopter.
- [Runtime contract](RUNTIME-CONTRACT.md) and [module contract](MODULE-CONTRACT.md)
  — wire and adapter acceptance conditions.
- [Validation record](VALIDATION.md), [Pilot 01](PILOT-01.md) and [Pilot 02](PILOT-02.md) — test, internal and public-route pilot receipts.
