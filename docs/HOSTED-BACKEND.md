# Hosted backend checkpoint

[简体中文](HOSTED-BACKEND.zh-CN.md)

[Production decision record](decisions/0001-shared-ec2-insforge-pilot.md)

FlowWitness now has a reachable hosted backend for sponsor review and a
non-sensitive pilot:

- API and operator app: `https://flowwitness-production-5c3588af-7e51-4667-b744-e8542ac0167b.fly.dev/`
- Health check: `/health`
- Operator UI: `/app/`
- Public concept edge preview: `https://flowwitness-preview.dave-z.workers.dev/`

## Shared EC2 pilot route

The browser-capable sponsor pilot is currently running beside DSH on the
existing ARM64 EC2 host:

- API and operator app: `https://commodity-consult-hourly-sen.trycloudflare.com/`
- Synthetic application namespace: `demo-reports-ec2-pilot`
- FlowWitness listens privately on port `4310`; DSH remains on port `3080`
- Access is an outbound Cloudflare quick tunnel; no inbound security-group rule was added

On September 12, 2026, the merged `b7da9c4` checkout passed the hosted
release-A replay, private PNG retrieval, explicit publication, stale release-B
failure, repair replay, English/Chinese query, authentication, invalid-image,
and service-restart checks. [Pilot 02](PILOT-02.md) then ran a fresh public-route
two-release rehearsal with a separate workflow ID, signed delivery deduplication
and image deletion. The pilot uses synthetic fixture data only. The
quick-tunnel hostname is temporary and may change when the connector is
recreated; it is not a production hostname or a durable availability claim.

The hosted service is the same Node.js/Playwright application in this
repository. It is authenticated with separate admin and support credentials.
The service uses project-admin-only InsForge tables and versioned RPCs to mirror
workflow state, job history, publications, questions, Stage 1 module records,
and private artifact bytes. A machine restart therefore does not erase the pilot
state. The support module scope is bound to a configured conversation ID; the
support token cannot select another conversation. The admin key is injected into
the service environment and is never part of the repository or browser UI.

This is a hosted pilot backend, not a production certification. The original
InsForge free Compute endpoint above remains the fallback plane. That plan
permits one `shared-1x` machine with 512 MB of memory; an attempted 1024 MB
update was rejected by that plan. Its HTTP API, authentication, legacy and
module state mirror, support binding, image upload and artifact retrieval have
passed external checks, but its bundled Chromium replay cannot reliably create
a page at that memory limit. The existing shared ARM64 EC2 host is the
browser-capable pilot path; it does not remove the need for stable ingress,
backup/restore, alerting or an adopter-owned preview before production claims.

The service currently scales to zero on the pilot tier. A cold-start probe took
longer than 15 seconds but recovered within 60 seconds; this is an observed
pilot behavior, not a support latency SLO.

Promotion to production requires:

1. A repeatable browser-capable runtime with a stable named TLS endpoint. The
   shared EC2 host has passed the synthetic release-A/release-B loop, while its
   accountless quick tunnel is temporary and must not be treated as production
   ingress. A paid memory tier or approved remote browser worker remains an
   alternative.
2. A custom domain/TLS policy, webhook secret, backup/restore drill, alerting,
   and an operator-owned preview application with non-sensitive test data.
3. A repeat of the two-release pilot with an adopter-owned preview, including
   current-versus-stale query behavior, private evidence access, English/Chinese
   responses, and restart recovery. [Pilot 02](PILOT-02.md) is the public
   synthetic rehearsal; it does not satisfy this external gate.
4. An explicit decision on tenancy and retention before serving more than one
   application per service.

Until those checks pass, describe the endpoint as the hosted pilot backend and
the Cloudflare site as the public concept preview. Do not give customer code or
browser credentials to the operator UI.
