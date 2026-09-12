# Pilot 02 — public route rehearsal

**Date:** 2026-09-12  
**Purpose:** exercise the complete Stage 1 release loop through the public
hosted route before asking an external adopter to provide a preview target.

This is a sponsor-review rehearsal, not the external S1-09 pilot. It used the
bundled `/fixture/` application, disposable synthetic report data and a new
workflow ID inside the existing isolated application namespace. No customer
credentials, personal data or production application were used.

## Runtime

- Route at run time: `https://commodity-consult-hourly-sen.trycloudflare.com`
- Application namespace: `demo-reports-ec2-pilot`
- Workflow: `public-pilot-export`
- Checkout: `b7da9c4` (the deployed application code; later documentation
  commits do not change the runtime)
- Compute: existing ARM64 EC2 host shared with DSH; FlowWitness stayed on
  loopback port 4310 and DSH stayed on loopback port 3080.
- Ingress: accountless Cloudflare quick tunnel. The hostname is temporary and
  is not a production TLS or uptime claim.

The EC2 instance was later restarted, which rotated the accountless tunnel to
`https://terrain-gilbert-agreement-counter.trycloudflare.com`. The current v2
publication was re-verified and re-published at that address; the run receipt
below remains tied to the original hostname.

## Receipt

### Release A — `v1`

1. Imported and validated the new workflow against `fixture-v1`.
2. Real Chromium replay passed in 643 ms and captured a 15,490-byte private
   PNG (`c4cf612e-b3b5-46f9-92ee-5f8855d08354`).
3. Explicit publication succeeded (`883fe819-10d1-44e8-8dbb-95e79a353642`).
4. The support-scoped query returned `answered` in English (249 ms) and
   Chinese (733 ms).

### Release B — `v2`

1. The fixture moved **Export report** into **More** and the deployment identity
   changed to `fixture-v2`.
2. The signed GitHub push payload created one review question
   (`041bd18f-4fed-4310-b9df-7473e7df643e`); replay of the old one-step workflow
   failed in 5,348 ms and retained a private 12,886-byte failure PNG
   (`2e15dbdf-8916-4318-8399-83b9cd9d9fc6`). Publishing that failed run returned
   HTTP 400.
3. The current-release query returned `unavailable`; an explicit `v1` request
   still returned the matching old guide.
4. Replaying the repaired two-step workflow passed in 632 ms and captured a
   private 14,285-byte PNG (`81b5ac38-1399-4a62-9362-6215d62c5ab9`). Explicit
   publication succeeded (`183865c6-6840-4d26-bdc0-e783811033cc`).
5. English (330 ms) and Chinese (326 ms) support queries returned the repaired
   two-step guide, beginning with `选择更多。`.
6. Repeating the same signed delivery ID returned `duplicate: true`, proving
   replay-safe webhook intake.

## Boundaries checked

- A consented image upload was readable through the authenticated artifact
  route, then deleted; the same ID returned HTTP 404 afterward.
- Restarting `flowwitness-pilot.service` left the DSH service active and the
  published Chinese answer available (794 ms after reconnect).
- Unauthenticated public API access remains 401; the public operator app and
  health endpoint remain reachable.
- The quick tunnel does not establish a stable domain, backup/restore drill,
  alerting, multi-application tenancy or external adoption.

## Decision

The public route can now demonstrate the browser-capable Stage 1 loop on the
shared EC2 host. S1-09 remains open because this rehearsal used FlowWitness's
own fixture. The next external action is to obtain one adopter-owned,
non-sensitive preview URL (or local preview) and its deployment identity
endpoint, then repeat this receipt without changing the product contracts.
