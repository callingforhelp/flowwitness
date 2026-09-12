# Production decision record: shared EC2 pilot with InsForge

[简体中文](0001-shared-ec2-insforge-pilot.zh-CN.md)

**Status:** Accepted for the bounded sponsor pilot; shared EC2 pilot deployed; production promotion remains gated
**Date:** 2026-09-12
**Owner:** FlowWitness maintainer
**Review trigger:** After the first external two-release pilot, or before accepting sensitive customer data

## Decision

The next hosted validation cycle will use the existing shared AWS EC2 host for
browser-capable execution. FlowWitness will run beside the existing DSH service
as a separate unprivileged service on port `4310`; DSH remains on port `3080`.

InsForge remains the control plane and source of truth for application state,
jobs, authentication, and the private `flowwitness-private` artifact bucket.
The current InsForge Compute endpoint remains available as a fallback while the
EC2 path is validated. No paid InsForge Compute tier, new EC2 instance, new EBS
volume, new S3 bucket, or remote browser provider is required for this pilot.

The existing EBS disk is local scratch space for the shared host. Durable
screenshots, uploads, and videos belong in object storage once the artifact
adapter is wired; EBS is not the cross-instance storage interface. A standard
gp3 volume remains attached to one host and is not mounted by multiple EC2
instances.

## Scope and runtime shape

When the pilot service is enabled, it will use:

| Plane | Shared resource | Boundary |
| --- | --- | --- |
| API and state | InsForge project and current hosted endpoint | InsForge RPCs and existing authentication remain authoritative |
| Browser execution | Existing `flinter-orca-dsh` EC2 host | Separate FlowWitness service, port `4310`, one active replay |
| Local scratch | Host root EBS volume | Temporary browser files only; private directory and cleanup required |
| Durable artifacts | InsForge `flowwitness-private` bucket | Private object keys and scoped metadata; no public bucket |
| Public access | Temporary outbound Cloudflare Tunnel | No new inbound security-group rule or custom domain for the pilot |

The FlowWitness unit must run as `ubuntu`, use a private data directory, and
have an explicit memory/task limit (initial target: `MemoryMax=900M`, one queued
browser job). It must not stop, replace, or reconfigure the DSH unit. Customer
credentials and sensitive customer data are outside this pilot's scope.

## Current pilot receipt

The bounded pilot is deployed from merged revision `b7da9c4` in the isolated
`demo-reports-ec2-pilot` application namespace:

- `flowwitness-pilot.service` runs as `ubuntu` on private `127.0.0.1:4310` with
  `MemoryMax=900M` and one active browser job.
- `dsh.service` remains active on `127.0.0.1:3080`; the DSH unit and its
  configuration were not changed.
- The current sponsor URL is
  `https://commodity-consult-hourly-sen.trycloudflare.com/`, provided by an
  accountless outbound Cloudflare quick tunnel. No inbound security-group rule,
  new EC2 instance, EBS volume, S3 bucket or paid InsForge tier was added.
- The host passed the real ARM64 release-A/release-B synthetic loop through its
  private acceptance path: v2 publication, stale-answer withdrawal, old-step
  failure, repair, private PNG retrieval, English/Chinese query,
  authentication and restart persistence all passed. A public-route smoke then
  passed the current v2 identity/publication, bilingual query, authentication
  boundary and operator app. No customer data or credentials were used.

The quick-tunnel URL is temporary and may change when the connector is
recreated. A URL change requires updating the service's public-origin
configuration and rerunning the current-release check; this route is a pilot
access path, not production ingress.

## Evidence behind the decision

The 2026-09-12 inspection found:

- The shared host is an Ubuntu 22.04.5 ARM64 `t4g.small` with 2 vCPUs, 2 GiB
  RAM, and one 40 GiB gp3 root volume. No second EBS volume is attached.
- SSM is online. The host already runs `dsh.service` and a Node service on
  `127.0.0.1:3080`; Docker is not installed.
- With DSH running, the host had about 1.1 GiB available memory. A real
  Playwright 1.63 ARM64 Chromium smoke test launched, navigated, clicked,
  asserted, and captured a PNG using the same low-memory launch flags as the
  FlowWitness runner.
- The InsForge project has a private, empty `flowwitness-private` bucket. Current
  FlowWitness artifact code still stores bytes in the private state snapshot,
  so bucket delivery is a follow-up implementation rather than an existing
  claim. See [PLATFORM.md](../PLATFORM.md#insforge-boundary).
- The current hosted InsForge Compute machine is a free 512 MB `shared-1x`;
  its API and state checks pass, while bundled Chromium cannot reliably create
  a page. See [HOSTED-BACKEND.md](../HOSTED-BACKEND.md).

## Why this is the least-commitment path

This keeps the existing backend and rollback path, uses already-available
compute and storage, and tests the real browser loop before adding a provider
contract or a recurring paid tier. Sharing is controlled by process boundaries,
ports, a single-job lease, memory limits, and private object paths rather than
by sharing a filesystem between hosts.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| DSH and Chromium contend for 2 GiB RAM with no swap | One replay at a time, `MemoryMax`, cleanup, and memory/OOM observation before any external data |
| The host carries legacy DSH permissions | Run as `ubuntu`, use synthetic data, do not alter DSH, and review/replace the host role before production |
| The root EBS volume is unencrypted and delete-on-termination | Treat it as scratch only; keep durable artifacts in private object storage and use an encrypted disk for a later production host |
| The host has no Docker or inbound security-group rule | Use a direct Node service for the pilot and SSM plus an outbound temporary tunnel |
| Artifact bytes can bloat the InsForge state snapshot | Implement the private bucket adapter before large recordings or videos |
| Shared execution is not production isolation | Keep the service single-application and pilot-only; require the production gates below |

## Acceptance gates before production promotion

1. The isolated FlowWitness unit starts and passes authenticated health, setup,
   image, module, and private artifact checks without changing DSH behavior.
2. The hosted release-A/release-B browser loop passes, including stale-answer
   withdrawal, repair, redacted screenshots, and explicit publication.
3. A restart preserves InsForge state and can still deliver a scoped private
   artifact.
4. Signed GitHub push intake, support binding, English/Chinese responses, and
   the first external two-release pilot are recorded.
5. Memory, cold-start, error, and cleanup observations support an explicit
   keep-warm/stop policy.
6. Before production data, replace legacy host permissions, use encrypted
   storage, complete backup/restore and alerting, and decide tenancy/retention.

## Rollback

Stop only the FlowWitness service and remove its temporary code/data directory.
Leave DSH on port `3080`, the InsForge project, the current hosted endpoint, and
the EBS attachment unchanged. Do not detach or delete the volume as part of a
FlowWitness rollback.

## Deferred alternatives

- A paid InsForge Compute tier is deferred until the shared-host pilot fails or
  sustained usage justifies it.
- A remote browser adapter is deferred until a real adopter needs provider
  isolation or hosted browser scaling.
- A dedicated encrypted EC2 host is a production-hardening option, not a
  prerequisite for the first pilot.
- AWS S3 remains an optional object-storage migration after the InsForge bucket
  adapter and retention requirements are measured.
