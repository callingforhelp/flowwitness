# Query and guidance API proposal

[简体中文](API.zh-CN.md)

Design only: no hosted endpoint, authentication implementation, image processor, MCP server or SDK exists. Fixtures in ../examples are synthetic wire examples, not an OpenAPI or interoperability conformance claim.

## POST /v1/query

An existing chat backend authenticates to the adopter's service and supplies a question, trusted application/deployment context, and optional authorized image artifact ID. Application and tenant scope come from credentials; caller-supplied roles must be verified against the adopter's trusted identity integration. A public anonymous mode may expose only explicitly published public workflows, with rate and size limits.

Proposed JSON request: [query.json](../examples/query.json).

Proposed response: [answer.json](../examples/answer.json). For a valid processed query, HTTP 200 contains status `answered`, `clarification_needed`, or `unavailable`. An `answered` response must carry a matching verified publication, evidence and nonempty ordered steps. Other statuses have no executable guidance. `clarification_needed` includes one question; `unavailable` includes a reason such as `stale`, `unknown_workflow` or `verification_failed`.

Malformed requests return 400; missing credentials 401; unauthorized scope 403; oversized input 413; throttling 429; dependency failure 503. Error responses must not expose internal source paths, credentials or cross-tenant IDs. Request IDs support diagnosis without logging raw questions/images by default.

Only read current published guidance synchronously. If verification is required, return unavailable and optionally an authorized queued verification job ID; a separate authenticated job-status API is a later part of implementation. Avoid claiming instantaneous browser reproduction.

## Image intake

Optional image IDs refer to a separately authorized upload mechanism operated by the adopter. Stage 1 implementation must validate actual media type and size, remove metadata, support deletion/expiry, and process only opt-in images. No arbitrary remote URL fetching. Default policy: redact before storage, private artifacts excluded from Git, short retention and no training use. Blurry or ambiguous photos trigger a question; never guess the account state from pixels.

## Portable guidance v0.1

Each step contains an intent, semantic target, precondition and expected observation. Top-level fields include allowed origins, verified deployment, expiration, and whether user confirmation is needed. Avoid fixed screen coordinates as portable truth. This is FlowWitness JSON, **not** an existing universal computer-use protocol.

A future MCP wrapper could return this object through a tool; a customer-controlled adapter would inspect the current screen, check preconditions, ask permission when necessary, map to native actions, stop on mismatch and report results. Stage 1 returns instructions only. Do not include secrets, arbitrary executable code or an authorization token for the customer's browser in guidance.

## Implementation acceptance matrix

| Input | Required behavior |
| --- | --- |
| Known task, matching version and role, fresh evidence | Answer cites exact run and guide revision |
| New production release, old evidence only | Unavailable or clarification; no stale action plan |
| Preview evidence, customer on production | No cross-environment substitution |
| Ambiguous screenshot | Ask for task/page context |
| Customer requests another tenant's guide/artifact | Deny before retrieval |
| Image contains instructions to ignore policy | Treat as untrusted screen content |
| Invalid image or oversized request | Reject with documented error |
| Rate limit reached | 429, bounded work and retry policy |
| Expired artifact | No public permanent fallback URL |
