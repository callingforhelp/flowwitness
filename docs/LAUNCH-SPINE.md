# FlowWitness launch spine

**Status:** active execution plan
**Owner:** FlowWitness maintainer
**Updated:** 2026-09-12

This plan puts one real product launch path ahead of infrastructure expansion
and Stage 2 feature work. The goal is to let one adopter use FlowWitness with
one non-sensitive preview application and one customer workflow.

## The launch slice

The first launch is a narrow service, not a general agent platform:

- one adopter-owned preview application;
- one workflow with an explicit role, source paths, selectors and expected
  outcome;
- one stable HTTPS FlowWitness endpoint;
- one bounded Chromium worker on the existing shared EC2 host;
- InsForge for workflow state, questions, publications and private evidence;
- one existing support backend calling `/v1/query`.

The golden path is:

```text
Git push
  → signed webhook and scoped impact question
  → operator resolution
  → bounded Chromium replay in the approved preview
  → private evidence
  → explicit publication
  → support query returns the release-matched English/Chinese guide
```

## Work order

| Order | Work | Exit evidence | State |
| --- | --- | --- | --- |
| 1 | Repeatable launch smoke | `npm run smoke:launch` checks health, auth boundary, operator app, deployment identity, a verified workflow, bilingual support answers and private evidence without mutating state. | **Implemented in this change** |
| 2 | Stable pilot ingress | Named HTTPS route with a restart/runbook policy; the accountless quick tunnel is retired from adopter use. | **Implemented for sponsor pilot** at `https://flowwitness-pilot.useflinter.com/`; external adoption remains gated |
| 3 | Real support connection | One existing chat/backend holds the support credential and trusted conversation binding; no new chat UI. | Open; endpoint contract already exists |
| 4 | External two-release pilot | Release A publish, release B UI change, stale suppression, failed replay evidence, repaired publication, bilingual queries and measured retention/latency. | Open; synthetic Pilot 02 is not this gate |
| 5 | Launch hardening | Backup/restore, alerting, retention decision, memory/cold-start observation and operator runbook. | Open; use the existing EC2/InsForge first |
| 6 | Stage 2 selection | Choose reproduction or video from an observed pilot failure. | Deferred until order 4 produces evidence |

## What is deliberately out of scope

Do not add paid compute, a remote browser provider, multi-tenancy, a new chat
product, an always-on agent swarm, vision, computer-use execution, scheduler,
Archify export or a production video delivery path before the launch slice has
an adopter and measurements. These remain separate Stage 2 or later decisions;
they are not deleted.

## Launch acceptance

The launch slice is ready for a controlled adopter when all of these are true:

1. A fresh checkout can run the read-only launch smoke against the selected
   endpoint without printing credentials.
2. A real signed push creates one scoped review question for the adopter's
   workflow and a duplicate delivery is ignored.
3. Release A and release B both have browser receipts and private screenshots.
4. The current release never returns the stale guide; an explicitly requested
   old release still returns its matching guide.
5. A repaired publication is available through the existing support backend in
   English and Chinese.
6. A restart preserves the records and private evidence, and the operator has
   recorded setup time, repair time, warm/cold latency, correctness, false
   alerts, retention and keep-enabled feedback.

Until an adopter completes this list, describe FlowWitness as a hosted pilot
backend and local alpha, not as production infrastructure.

## Current baseline

The shared ARM64 EC2 rehearsal in [Pilot 02](PILOT-02.md) proves the browser,
publication, stale-answer, bilingual query, artifact and restart path with
synthetic data. The named Cloudflare route at
`https://flowwitness-pilot.useflinter.com/` now provides the stable sponsor
pilot ingress; the accountless quick tunnel was retired. The next material
input is an adopter-owned, non-sensitive preview target and its deployment
identity endpoint.
