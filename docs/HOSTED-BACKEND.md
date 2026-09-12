# Hosted backend checkpoint

[简体中文](HOSTED-BACKEND.zh-CN.md)

FlowWitness now has a reachable hosted backend for sponsor review and a
non-sensitive pilot:

- API and operator app: `https://flowwitness-production-5c3588af-7e51-4667-b744-e8542ac0167b.fly.dev/`
- Health check: `/health`
- Operator UI: `/app/`
- Public concept edge preview: `https://flowwitness-preview.dave-z.workers.dev/`

The hosted service is the same Node.js/Playwright application in this
repository. It is authenticated with separate admin and support credentials.
The service uses project-admin-only InsForge tables and versioned RPCs to mirror
workflow state, job history, publications, questions, Stage 1 module records,
and private artifact bytes. A machine restart therefore does not erase the pilot
state. The support module scope is bound to a configured conversation ID; the
support token cannot select another conversation. The admin key is injected into
the service environment and is never part of the repository or browser UI.

This is a hosted pilot backend, not a production certification. The current
InsForge free plan permits one `shared-1x` machine with 512 MB of memory; an
attempted 1024 MB update was rejected by that plan. The
HTTP API, authentication, legacy and module state mirror, support binding,
image upload, and artifact retrieval have passed external checks, including a
module record read after a Compute restart. The bundled Chromium replay reaches
the browser launch but cannot reliably create a page at that memory limit, so a
browser verification job remains failed until the machine is moved to a larger
memory tier or an approved remote browser adapter is configured. No successful
hosted browser run is claimed.

The service currently scales to zero on the pilot tier. A cold-start probe took
longer than 15 seconds but recovered within 60 seconds; this is an observed
pilot behavior, not a support latency SLO.

Promotion to production requires:

1. A memory tier that passes the real Chromium release-A/release-B loop, or an
   approved remote browser worker with the same origin and evidence controls.
2. A custom domain/TLS policy, webhook secret, backup/restore drill, alerting,
   and an operator-owned preview application with non-sensitive test data.
3. A repeat of the two-release pilot, including current-versus-stale query
   behavior, private evidence access, English/Chinese responses, and restart
   recovery.
4. An explicit decision on tenancy and retention before serving more than one
   application per service.

Until those checks pass, describe the endpoint as the hosted pilot backend and
the Cloudflare site as the public concept preview. Do not give customer code or
browser credentials to the operator UI.
