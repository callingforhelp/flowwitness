# Native module composition

`createServer` mounts issues, knowledge, agents, reproduction, video and maintenance by default. `moduleRuntime` exposes `modules`, `repository`, `artifacts`, `jobs`, `handle` and `close`. `modules: false` disables composition for compatibility.

The durable platform snapshot and writer lock live in `<legacy private directory>/modules`, separate from legacy workflow state. Server shutdown closes both stores. Imports start no work. Browser and renderer adapters are optional `browser` and `renderer` server options; no FFmpeg process or job worker starts automatically. Per-module settings use `moduleConfig`.

Existing bearer tokens, Host/Origin checks, rate limits and body limits apply before dispatch. Configure trusted bindings with `modulePrincipals: {admin: {subjectId, role, conversationId}, support: {subjectId, conversationId}}`. Application always comes from server configuration. Admin defaults to operator with explicit null application scope; admin may select agent. Support always maps to customer and requires a configured conversation for module requests. Headers, query and body cannot select identity or conversation. A shared support token therefore represents one configured conversation; it is not a multi-customer authentication system.

The coordinator passes parsed query parameters and a requestId to modules. Module errors use requestId; legacy errors retain request_id. Artifact content links require bearer authentication in authenticated mode and a live scoped link token on every read. Local mode retains the existing loopback trust model.

Maintenance methods accept `(principal, input)` and require an operator. The injected `workflowAdapter` implements `impact(input)`, `verify(input)` and `publish(input)`. Defaults call the existing service with `workflowId` and `runId` for verification/publication. Its HTTP handler defers to legacy routes so workflow/query lifecycle behavior stays intact.

Focused checks: `node --test test/composition.test.mjs test/unit.test.mjs test/lifecycle.test.mjs`.
