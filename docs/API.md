# Query and guidance API — local alpha

[简体中文](API.zh-CN.md)

The HTTP service is implemented and can be run locally. There is no managed public endpoint, MCP server or SDK. See [runtime routes and workflow schema](RUNTIME-CONTRACT.md) and the [runbook](OPERATIONS.md). Examples are illustrative wire shapes, not an OpenAPI conformance claim. The implementation is single-application; multi-tenant authorization and anonymous public access are not implemented.

## POST /v1/query

An existing chat backend authenticates to the adopter's service and supplies a question, trusted application/deployment context, and optional authorized image artifact ID. Application scope is fixed by the server. Separate admin and support credentials control endpoint access. Caller-supplied roles must be verified by the trusted chat backend using the support credential. Anonymous public queries are not enabled; unauthenticated mode is loopback-only for a trusted operator.

JSON request: [query.json](../examples/query.json).

Response shape: [answer.json](../examples/answer.json). For a valid processed query, HTTP 200 contains status `answered`, `clarification_needed`, or `unavailable`. An `answered` response must carry a matching verified publication, evidence and nonempty ordered steps. Other statuses have no executable guidance. `clarification_needed` includes one question; `unavailable` includes a reason such as `stale`, `unknown_workflow` or `verification_failed`.

Malformed requests return 400; missing credentials 401; unauthorized scope 403; oversized input 413; throttling 429; dependency failure 503. Error responses must not expose internal source paths, credentials or cross-tenant IDs. Request IDs support diagnosis without logging raw questions/images by default.

Only read current published guidance synchronously. If verification is required, return unavailable and optionally an authorized queued verification job ID; GET /v1/jobs/:id exposes the queued verification status to the operator. Avoid claiming instantaneous browser reproduction.

## Image intake

POST /v1/images accepts a consent flag and base64 PNG/JPEG/WebP image up to 2 MB and 16 million pixels. It decodes and re-encodes the file without source metadata. GET/DELETE /v1/artifacts/:id retrieves or deletes the private resource; startup and periodic cleanup remove expired files. Images are not interpreted. No arbitrary remote URL fetching. Uploaders must redact sensitive content before uploading; image normalization does not remove visible personal information. Browser captures mask configured selectors. Private artifacts are excluded from Git and expire. The alpha does not infer account state or answer questions from image pixels.

## Portable guidance v1

Each step contains an intent, semantic target, precondition and expected observation. Top-level fields include allowed origins, verified deployment, expiration, and whether user confirmation is needed. Avoid fixed screen coordinates as portable truth. This is FlowWitness JSON, **not** an existing universal computer-use protocol.

A future MCP wrapper could return this object through a tool; a customer-controlled adapter would inspect the current screen, check preconditions, ask permission when necessary, map to native actions, stop on mismatch and report results. Stage 1 returns instructions only. Do not include secrets, arbitrary executable code or an authorization token for the customer's browser in guidance.

## Implementation acceptance matrix

| Input | Required behavior |
| --- | --- |
| Known task, matching version and role, fresh evidence | Answer cites exact run and guide revision |
| New production release, old evidence only | Unavailable or clarification; no stale action plan |
| Preview evidence, customer on production | No cross-environment substitution |
| Ambiguous screenshot | Ask for task/page context |
| Query targets another application | Reject; this server does not implement multi-tenancy |
| Image contains instructions to ignore policy | Treat as untrusted screen content |
| Invalid image or oversized request | Reject with documented error |
| Rate limit reached | 429, bounded work and retry policy |
| Expired artifact | No public permanent fallback URL |
