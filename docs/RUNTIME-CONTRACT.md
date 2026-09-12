# Stage 1 runtime contract

Implementation contract, 2026-09-12. Domain decisions belong to the coordinator; implementation workers must report any necessary deviation before changing shared interfaces.

## Layout and runtime

Node.js >=22 ESM, native HTTP server, Playwright browser adapter, sharp image normalization. Git-friendly workflow JSON plus private runtime JSON state and artifacts under `.flowwitness/private/` (gitignored). Single service process owns atomic state writes; refuse a second writer using lock. Recover queued/running jobs as interrupted on restart. Hosted mode mirrors the state snapshot and private artifact bytes to InsForge through project-admin-only versioned RPCs, while local mode remains file-backed. No model credentials required. Deterministic intent matching with abstention, not claimed AI understanding.

`npm install`, `npx playwright install chromium`, `npm start` starts localhost:4310. Serve `app/` at /app/, existing `site/` at /, real fixture at /fixture/. Node test runner. `npm test` unit/API; `npm run test:integration` actual browser loop. CLI `bin/flowwitness.mjs` exported package bin `flowwitness`: init, validate <file>, import <file>, list, impact --base <ref> --head <ref>, verify <id>, query <question>, serve. Commands with local state must use service or acquire the same lock, never race the server. CLI supports FLOWWITNESS_URL and FLOWWITNESS_TOKEN; never print secrets.

## Auth and local mode

Default binds 127.0.0.1 only. With no token configured this is explicitly local trusted-user mode; reject non-loopback Host headers, reject cross-origin requests, require `X-FlowWitness-Client: dashboard` or `cli` on mutations. No permissive CORS. Binding non-loopback requires FLOWWITNESS_ADMIN_TOKEN and FLOWWITNESS_SUPPORT_TOKEN (different, sufficiently long); bearer comparison constant-time. Support credential grants only query/image/artifact paths for configured application, not management. No multi-tenant claim: one application per server. Never accept application other than configured id. Support role context comes from trusted chat backend using credential, not unauthenticated end-user input. UI token stays in memory, never localStorage. Token inputs type=password. Body/image/rate/queue limits. Error JSON `{error:{code,message},request_id}` without secrets/raw stack.

## Workflow object

```
{
 "schema_version":"1", "id":"export-report", "application":"demo-reports",
 "title":"Export a report", "questions":["How do I export a report?","导出报告"],
 "role":"admin", "locale":"en", "source_paths":["fixtures/reports.html"],
 "shared_paths":["src/auth/"], "start_path":"/fixture/",
 "steps":[
  {"id":"export","instruction":"Select Export report.","instruction_zh":"选择导出报告。",
   "action":{"type":"click","selector":"#export"},
   "assertion":{"type":"visible","selector":"#download-ready"},
   "expected":"CSV is ready.","expected_zh":"CSV 已就绪。"}
 ],
 "redact_selectors":["input[type=password]","[data-private]"]
}
```

Accepted step actions: click/fill (fixed nonsecret text)/assert; assertions visible/text/url (relative pathname). No JS evaluation from workflow, shell actions, arbitrary remote URLs, unsafe input types or password filling. Selectors length bounded, unique step IDs, source relative paths only (no ..), >=1 <=20 steps; source/step metadata mandatory. Server calculates revision SHA256 of normalized workflow; caller cannot assert verified status. Workflow files `workflows/<id>.json` editable/exportable, imported through validation. Saving changed workflow invalidates latest candidate, but retain immutable published snapshots for matching older deployments.

## Deployment

```
{"version":"v1","environment":"local","base_url":"http://127.0.0.1:4310","source_revision":"<git sha or fixture-v1>","identity_path":"/fixture/version"}
```

Server config allowed origins, never arbitrary query-time URLs. Identity GET must return `{version,source_revision}` matching deployment before AND after replay. Browser requests/navigation restricted to allowed base origin including redirects; block service workers. Limits: one job active, max queue 10, steps timeout 5s, job 90s; cleanup browser on all outcomes. Operator-specified trusted apps only; browser context not hostile-code sandbox. Image screenshots sanitized/masked; store with TTL and SHA256. Authenticated artifact endpoint only; no static private folder exposure.

## HTTP API used by frontend

- GET /health -> {status:"ok",mode:"local"|"authenticated",application:"demo-reports"}
- GET /v1/workflows -> {workflows:[{...workflow,revision,status:"draft"|"stale"|"verified"|"failed",last_run:run|null}]}
- POST /v1/workflows body workflow -> 201 {workflow: enrichedWorkflow}
- GET /v1/workflows/:id -> {workflow:enrichedWorkflow}
- DELETE /v1/workflows/:id -> {deleted:true} (admin only; invalidate publications)
- GET /v1/deployment -> {deployment: object|null}
- PUT /v1/deployment body deployment -> {deployment}; record new target, do not label source push a deployment
- POST /v1/workflows/:id/verify body {} -> 202 {job:job}; idempotent workflow revision+deployment+pending job
- GET /v1/jobs -> {jobs:[job]}; GET /v1/jobs/:id -> {job}
- job: {id,workflow_id,status:"queued"|"running"|"passed"|"failed"|"interrupted",created_at,run_id?,error?}
- GET /v1/runs/:id -> {run}; run {id,workflow_id,revision,status:"passed"|"failed",deployment,started_at,finished_at,steps:[{id,status,error?,artifact_id?}],error?}
- POST /v1/workflows/:id/publish {run_id} -> {publication}; only successful unexpired current revision+deployment run, no unresolved workflow questions; explicit operator approval required
- GET /v1/questions -> {questions:[{id,workflow_id,revision,question,status:"open"|"resolved"}]}
- POST /v1/questions/:id/resolve {answer:string} -> {question}; resolve does not make a failed run pass
- POST /v1/impact {changed_paths:[string],source_revision:string} -> {affected:[id],unmapped:[path],questions:[question]}; changes create draft/stale candidate/question without silently altering old deployed snapshot
- POST /v1/webhooks/github GitHub raw signed push -> same impact receipt, verify HMAC env FLOWWITNESS_WEBHOOK_SECRET, delivery id dedupe, bounded payload; refuse missing secret/signature and incomplete/truncated changes (require full local CLI diff)
- POST /v1/query {application,question,deployment_version?,environment?,context:{role,locale?},image_artifact_id?} -> {status:"answered"|"clarification_needed"|"unavailable",reason?,question?,workflow_id?,steps:[{id,text,expected}],evidence:[{run_id,artifact_id?}],guidance?:{schema_version:"1",execution_mode:"instructions_only",allowed_origins,expires_at,steps}}. Only exact publication deployment version/environment/role/locale context. Current deployment default. No actionable steps from draft/stale/failed/no publication/expired/unknown role. Unknown or ambiguous intent -> clarification. Image alone -> clarification; no claim image recognition.
- POST /v1/images JSON {image_base64,consent:true} ->201 {artifact:{id,expires_at}}; actual JPEG/PNG/WebP decode, <=2MB input <=16M pixels, re-encode strips metadata; no external fetch or SVG; consent mandatory
- GET /v1/artifacts/:id -> image/png, scoped and nonexpired; DELETE /v1/artifacts/:id ->{deleted:true}
- GET /v1/graph -> {nodes:[{id,type,label}],edges:[{from,to,type}]} from explicit sources/screens/steps/run references, no invented source analysis

## Real demo setup (admin only)

- POST /v1/demo/setup {} seeds default export workflow for v1, fixture state and deployment (using server bound origin); no verification or publication is fabricated; idempotent does not reset existing data silently
- POST /v1/demo/version {version:"v1"|"v2"} changes fixture DOM and corresponding local deployment identity; v2 moves button into hidden More menu so old workflow click times out
- POST /v1/demo/repair {} imports updated workflow with click More step then Export; no automatic verify or publish
- fixture serves its persisted version; /fixture/version identity JSON; #export, #more, #download-ready. Local CSV-ready state achieved by actual click, no customer messages/payments/deletion.

## Frontend

Separate actual app at app/index.html + app/app.mjs + app/styles.css. Bilingual English/Chinese operator dashboard. Fetch API only; no simulated success. On connection failure show offline error, never fallback to mock. Setup demo -> verify (poll job) -> inspect evidence -> publish -> ask -> change UI -> failure -> repair -> verify/publish again. Workflow list/import/edit JSON, deployment form, questions resolve, support question + optional image upload consent, evidence screenshots fetched via auth blob, instructions and machine guidance. Buttons disabled pending, clear errors/status, no duplicate poll intervals, accessible/mobile, tokens memory only. Existing marketing site retained until integration.

## Acceptance

Actual Chromium successful run/screenshots/publication/query, v2 stale withholding, old replay failure, repair success and new guide; wrong role/application/auth isolation; unknown questions/image only clarification; invalid workflow/image/body/path rejects; webhook signature/replay/truncation tests; persistence/restart interrupted recovery; expiry; current vs old publication identity; UI exercises API (no mocks). Documentation lists unimplemented automatic discovery/vision/native host hooks and the hosted pilot's remaining browser/module durability gates honestly.
