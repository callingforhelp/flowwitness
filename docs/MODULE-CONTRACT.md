# Next-release module contract

This is an implementation target, not a claim of shipped cloud support. Baseline: Node 22 ESM, native HTTP in `src/server.mjs`, orchestration in `src/service.mjs`, and private file persistence in `src/store.mjs`. Preserve local mode and the existing `/v1/query` request, response, authorization, and publication gates unchanged.

## Ownership and composition

- Modules live in `src/modules/{issues,knowledge,reproduction,video,agents,maintenance}/index.mjs`.
- Shared records, validation, repository/artifact/job adapters, and authorization live in `src/platform/`.
- Modules must not import another module's internals or access `store.data`, filesystem, HTTP sockets, cloud SDKs, or model clients directly. Inject adapters; reference other records by scoped ID.
- The server/coordinator instantiates modules, authenticates requests, composes routes, and connects public methods. Importing a module must cause no I/O or background work.
- Local adapters wrap existing persistence/service behavior. Cloud adapters use InsForge auth, Postgres, private storage, and functions. Select adapters at composition time; keep records portable and secrets out of them.

```js
export function createModule({ repository, artifacts, jobs, config, ...adapters }) {
  // Optional named adapters: browser (E2B), renderer (FFmpeg), workflow.
  return { ...methods, async handle(requestContext) { /* null or {status, body} */ } };
}
// All public methods are async: method(principal, input) -> JSON value.
// handle returns null only for an unowned path; owned unsupported methods -> 405.
// RequestContext = {method, path, query, body, principal, requestId}
// method: uppercase string; path: pathname; query: string-valued object;
// body: parsed JSON object; principal: trusted auth result, never body-derived.
// Principal = {application, role: "operator"|"agent"|"customer",
//              subjectId, conversationId?: string}
```

Use `{error:{code,message},requestId}` for errors: 400 invalid input, 401 unauthenticated, 403 denied, 404 absent/inaccessible, 409 conflict, 429 quota, 503 adapter unavailable. Coordinator serializes exceptions to this shape and strips private fields.

## Scope and portable records

All records have `{schemaVersion:1,id,application,conversationId:null|string,version,createdAt,updatedAt}`; times are UTC ISO strings, IDs opaque strings, version a positive integer. Every reference resolves within the same application and authorized conversation. Null conversation means application scope, never wildcard access. JSON only; artifact IDs replace bytes/paths/URLs. Server supplies base fields.

| Record | Required domain fields (optional marked `?`) |
| --- | --- |
| Issue | `title, description, locale:en|zh, status:open|investigating|resolved|closed, createdBy, resolutionEntryId?` |
| Message | `issueId, authorId, authorRole, text, locale:en|zh, artifactIds:[]` |
| KnowledgeEntry | `issueId?, kind:report|hypothesis|observation|attempt|resolution, title, summary, tags:[], evidenceBundleIds:[], visibility:private|published, evidenceStatus:unverified|verified|failed|stale|expired` |
| InvestigationJob | `kind:investigation|reproduction|video|maintenance, inputRef:{collection,id}, requiredCapabilities:[], idempotencyKey, status:queued|leased|succeeded|failed|cancelled, attempt, maxAttempts, deadlineAt, lease:null|{ownerId,token,expiresAt}, cancelRequestedAt:null|string, resultRef:null|{collection,id}, errorCode:null|string` |
| ReproductionRequest | `issueId, target:{origin,environment:preview|test,revision}, approvalRef, sessionSecretRef?, steps:[{action,selector?,value?}], limits:{concurrency,maxDurationMs,maxActions}, jobId` |
| EvidenceBundle | `jobId, target:{origin,environment,revision}, observations:[], artifactIds:[], status:unverified|verified|failed|stale|expired, validatorVersion, recordedAt, expiresAt` |
| VideoProject | `evidenceBundleId, locale:en|zh, edit:{trim:{startMs,endMs},captions:[{startMs,endMs,text}],logoArtifactId:null|string,colors:{primary,background,text},highlights:[{startMs,endMs,x,y,width,height}],narrationArtifactId:null|string}, jobId:null|string, outputArtifactId:null|string, visibility:private|published` |
| AgentCapability | `ownerId, runtime:claude-code|codex|pi, capabilities:[], lastSeenAt, enabled` |

Knowledge is a searchable reasoning bank of concise reports, hypotheses, observations, attempted fixes, and resolutions with provenance. Do not request or store hidden chain of thought, raw private deliberation, credentials, or browser profiles. `en` and `zh` content retains its original language; UI labels, errors, captions, and navigation support both. Missing translations are explicit; do not invent translated evidence.

## Injected repository

Every call is a Promise. `scope={application,conversationId}` is required; authorization is checked before calls and cloud policies enforce equivalent isolation. Collections use plural camelCase record names, plus existing workflow collections behind the maintenance adapter.

```js
repository.create(scope, collection, record) // persisted record; duplicate ID -> conflict
repository.get(scope, collection, id) // record | null
repository.query(scope, collection, {
  where: { /* allowlisted field: scalar equality */ },
  text: "", // optional case-insensitive substring over title/summary/description/text
  limit: 50, cursor: null // limit 1..100; stable createdAt,id ascending order
}) // {items, nextCursor:null|string}; opaque cursor bound to scope and query
repository.update(scope, collection, id, {expectedVersion, patch}) // record; CAS
repository.remove(scope, collection, id, {expectedVersion}) // {deleted:true}; CAS
repository.enqueue(scope, job, {idempotencyKey}) // atomic unique key per scope+kind
repository.claim(scope, {ownerId, capabilities, leaseMs}) // job | null; atomic
repository.renew(scope, id, {ownerId, token, leaseMs}) // job; live lease only
repository.settle(scope, id, {ownerId, token, status, resultRef, errorCode}) // job
repository.cancel(scope, id) // job; terminal unchanged, otherwise cancelled
```

Updates cannot change identity/scope or bypass protected job/evidence/publication transitions. Absent CAS targets return not-found; stale versions and stale lease tokens conflict. Create/update return incremented server-managed versions. Query semantics must match local and Postgres; optional full-text ranking cannot change this minimum contract.

Enqueue returns the existing job for the same key and canonical input, conflicts for different input. Claim selects the oldest eligible queued/expired-lease job with all required capabilities, increments attempt and issues a fresh fencing token atomically. Defaults: lease 60s (maximum 120s), heartbeat 20s, maxAttempts 3; renew cannot exceed deadline. Exhausted/deadline jobs fail. Settle allows only succeeded/failed, requires a current owner/token and validated scoped result. Cancel invalidates the lease immediately; workers stop and clean up, and late uploads/results cannot become accepted evidence. Local serialization plus durable writes and Postgres transactions must provide identical race guarantees; existing `save()` alone is insufficient.

## Artifact and job interfaces

```js
artifacts.put(scope, {jobId, leaseToken, kind, mediaType, bytes}) // private metadata
artifacts.get(scope, id) // {id,kind,mediaType,sha256,size,expiresAt,revokedAt} | null
artifacts.read(scope, id) // private byte stream; authorized consumers only
artifacts.link(scope, id, {expiresInMs}) // {url,expiresAt}; authorized delivery
artifacts.revoke(scope, id) // {revoked:true}; invalidate every issued link
jobs.enqueue(principal, {kind,inputRef,requiredCapabilities,idempotencyKey}) // job
jobs.get(principal, {id}) // sanitized job
jobs.claim(principal, {capabilities}) // leased job | null
jobs.heartbeat(principal, {id,token}) // lease metadata
jobs.complete(principal, {id,token,resultRef}) // validated terminal job
jobs.fail(principal, {id,token,errorCode}) // terminal job
jobs.cancel(principal, {id}) // cancelled job
```

Jobs facade enforces roles, registered capabilities, quotas, deadlines, and result validation; repository supplies atomicity. Artifacts expire after 24h, links expire no later than the artifact, and revocation/expiry is checked on every fetch (a bare irrevocable storage URL is insufficient). Secret references resolve only inside authorized adapters; no credentials in logs, records, responses, or evidence. Offline builders leave jobs queued until a capable agent reconnects or deadline expires; transient provider failure never fabricates completion.

## Public methods and HTTP ownership

| Module | Public methods | Routes |
| --- | --- | --- |
| issues | `create, get, list, addMessage, resolve` | `POST/GET /v1/issues`, `GET /v1/issues/:id`, `POST /v1/issues/:id/messages`, `POST /v1/issues/:id/resolve` |
| knowledge | `create, get, search, publish` | `POST/GET /v1/knowledge`, `GET /v1/knowledge/:id`, `POST /v1/knowledge/:id/publish` |
| agents | `register, list, investigate, getInvestigation, claim, heartbeat, complete, fail, cancel` | `POST/GET /v1/agents`, `POST /v1/investigations`, `GET /v1/investigations/:id`, `POST /v1/investigations/claim`, `POST /v1/investigations/:id/{heartbeat,complete,fail,cancel}` |
| reproduction | `create, get` | `POST /v1/reproductions`, `GET /v1/reproductions/:id` |
| video | `create, get, update, render, publish` | `POST /v1/videos`, `GET/PATCH /v1/videos/:id`, `POST /v1/videos/:id/{render,publish}` |
| maintenance | `impact, verify, publish` | coordinator retains existing workflow/impact routes through the injected workflow adapter |

Methods accept route IDs as `input.id`; lists accept repository query fields. Creates return 201 `{item}`, reads/updates 200 `{item}`, lists 200 `{items,nextCursor}`, async submissions 202 `{job,item?}`, empty claims 200 `{job:null}`. Mutating async inputs require `idempotencyKey`; PATCH requires `expectedVersion`. CLI and MCP call these same methods with the same principal and enforcement.

Operator configures approved targets, agents, quotas, workflow maintenance, and explicit publication. Agent is the builder's existing Claude Code, Codex, or pi runtime, claiming leased work through CLI/MCP; no mandatory model API or visitor runtime. Customer may create/read issues and messages in their bound conversation and read published authorized knowledge/video; cannot claim jobs, inspect private reasoning, approve sessions, or publish. Agents can submit findings for authorized jobs but cannot grant themselves scopes/capabilities or publish. Application-wide operator access requires explicit scope selection; customer requests without a conversation binding are denied.

E2B reproduction uses a fresh browser VM and approved preview/test session, never a production profile. Defaults per application: one concurrent VM, 10-minute run deadline, 50 browser actions; coordinator reserves the slot atomically and adapters enforce time/action limits and cleanup on cancellation/failure. FFmpeg rendering consumes private validated evidence and uploaded narration in English/Chinese; supports trim, timed captions, logo, colors, highlights, and narration mixing. Rendering does not imply verification or publication.

Evidence status is computed by the trusted validator from execution receipts, artifact hashes, target revision, expiry, and checks; a caller's `status:"verified"` is rejected. Publication requires an explicit operator call and current, validated, unexpired evidence for the matching revision/context; stale, failed, revoked, or expired evidence withdraws eligibility. Maintenance preserves existing unresolved-question and current-run publication gates. Knowledge without verified evidence remains visibly unverified and cannot masquerade as a verified answer.

## Independent acceptance fixtures

Each module must import and run with an in-memory repository, fake clock, fake artifacts/jobs, and only its optional adapter; no server, cloud credentials, sibling modules, or model API required. Run the same repository conformance fixtures against local and InsForge adapters separately.

- Issues/knowledge: two applications and two conversations cannot cross-read/search/reference; messages preserve author identity; searchable en/zh summaries retain kind/provenance; customer private reads fail.
- Jobs/agents: two simultaneous claims yield one owner; retry enqueue deduplicates; expiry fences old completion; cancel wins against late completion; offline registration leaves queued work; deadlines and max attempts terminate.
- Reproduction: fake E2B denies unapproved/production targets, reserves one slot under concurrent requests, stops at 50 actions/10 minutes, destroys VM on cancel, and never exposes session secrets.
- Video: fake renderer receives exact trim/captions/logo/colors/highlights/narration inputs for en/zh; invalid time bounds fail; render stays private; expired or revoked source evidence blocks publication.
- Maintenance/publication: caller-asserted verification fails; operator publish requires current validated receipts; revision changes/unresolved questions block it; revoke and 24h expiry invalidate every link.
- Composition: all six modules mount without internal cross-imports; unknown paths return null; bilingual UI exercises customer/operator/agent permissions; existing `/v1/query` lifecycle fixtures remain unchanged and pass.
