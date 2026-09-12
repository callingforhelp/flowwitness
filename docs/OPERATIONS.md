# Run and operate FlowWitness

[简体中文](OPERATIONS.zh-CN.md)

## Local first run

From the checkout, `npm ci`, `npx playwright install chromium`, then `npm start`. Linux may need `npx playwright install --with-deps chromium`. Browser installation downloads a separate executable; model credentials are not required. Open http://127.0.0.1:4310/app/.

The operator app uses real HTTP requests and has no offline mock fallback. Set up the sample workflow, verify, inspect screenshots, and explicitly publish. `/fixture/` is the actual sample application; the marketing page at `/` remains a separate simulation.

Workflow records are written to `workflows/<id>.json` under the service's working directory; private state and screenshots default to `.flowwitness/private/`. Commit reviewed workflow files if desired; never commit private state. Editing a workflow file alone does not update the running service—validate/import it through the CLI or dashboard. Back up private state only to private storage while the service is stopped. One process owns the data directory.

## Configuration

| Variable | Purpose |
| --- | --- |
| HOST / PORT | Defaults `127.0.0.1` / `4310` |
| FLOWWITNESS_APPLICATION | Single application ID; default `demo-reports` |
| FLOWWITNESS_DATA_DIR | Private state and artifact directory |
| FLOWWITNESS_PUBLIC_ORIGIN | Explicit request origin for reverse proxy/container access; never blindly trust forwarded headers |
| FLOWWITNESS_ALLOWED_ORIGINS | Comma-separated origins the operator may select for browser checks |
| FLOWWITNESS_BROWSER_ORIGIN | Optional private origin the hosted runner uses for its browser; the public deployment origin remains in customer guidance |
| FLOWWITNESS_STATE_BACKEND | `local` (default) or `insforge` for a remotely durable state snapshot |
| FLOWWITNESS_INSFORGE_URL | InsForge project URL required by the `insforge` state backend |
| FLOWWITNESS_INSFORGE_API_KEY | Project-admin key for server-only state RPCs; never expose it to a browser or commit it |
| FLOWWITNESS_STATE_MAX_BYTES | Maximum serialized hosted snapshot, default 8 MB; screenshots count toward this limit |
| FLOWWITNESS_ADMIN_TOKEN | Management credential for externally bound/authenticated mode |
| FLOWWITNESS_SUPPORT_TOKEN | Different credential for trusted support backend queries/images/artifacts |
| FLOWWITNESS_WEBHOOK_SECRET | GitHub push HMAC secret |
| FLOWWITNESS_URL / TOKEN | CLI destination and credential |
| FLOWWITNESS_ROLE / LOCALE | CLI query context |

Use two distinct tokens of at least 32 random characters. Keep them in a local environment or secret manager. `.env.example` has no credentials. To load an explicitly prepared `.env`, run `node --env-file=.env bin/flowwitness.mjs serve`; `npm start` does not automatically load it. Dashboard tokens live in memory and are cleared on reload. Local unauthenticated mode is for a trusted machine only; it rejects foreign origins and requires a client header for mutations.

External deployments need TLS termination, an operator-controlled allowed origin, private durable disk or the InsForge state backend, and a running Chromium-compatible environment. For a hosted deployment, set `FLOWWITNESS_STATE_BACKEND=insforge`, apply the migrations in `migrations/`, and keep the project-admin key server-side. `FLOWWITNESS_BROWSER_ORIGIN` may point at the service's private loopback so a reverse-proxy public origin is not used for the browser's own requests. Do not expose the management token in customer-side JavaScript. The support token is for a trusted chat backend that verifies customer role, not a public browser widget. One application per instance; tenant isolation across many customers is not implemented.

## Your own application

Configure an allowlisted base origin and a deployment identity path. The identity endpoint must return `{"version":"your-release","source_revision":"your-commit"}`. Supply those same values, environment and base URL through Deployment settings. Verification checks identity before and after replay.

Import a schema-1 workflow, starting from `examples/workflow.json`. Selectors and assertions must match your actual application. Use a safe test environment and non-sensitive test data. Current adapters support click, fixed text fill, and assertions; not arbitrary script execution, automatic credential transfer or logged-in session import. Browser contexts are not hostile-code isolation.

## Push changes and review

Use `flowwitness impact --base <known-base> --head <known-head>` from the application's Git checkout (CLI path may be absolute). The server lists affected workflows, unknown paths and review questions. A valid push webhook can submit the same information. It is signed, deduplicated, and refuses incomplete/force-created/deleted payload coverage that needs a full local diff. A webhook schedules review; it does not deploy code or silently publish a guide.

Update deployment identity separately after the app actually changes. Resolve review questions, run a fresh check and publish. Previously published guides can remain available for explicitly requested older deployment versions while their evidence is valid.

## Containers

`Dockerfile` and `compose.yaml` are provided. Prepare separate private admin/support token environment values before `docker compose up --build`. Compose maps port 4310 only to local loopback and persists `/data`. Configure the public origin when using a proxy. Container support must be validated in the target environment; the development machine did not have a running Docker daemon during initial validation.

## Recovery and privacy

A clean SIGINT/SIGTERM stops the service and releases its state lock after active work closes. A crashed process may leave `writer.lock`. Inspect the recorded PID and verify that its process has stopped before removing that exact lock; never remove an active writer's lock. Interrupted jobs are marked interrupted on reopen. Use a new verification run rather than relabeling interrupted/failed jobs as passed.

Uploaded pictures are opt-in, limited to PNG/JPEG/WebP and re-encoded to strip metadata. They are not interpreted by a vision model. Screenshots mask password inputs, `[data-private]` and workflow redaction selectors. Review your own redaction selectors before recording sensitive pages. Artifacts are private and expire; public API callers cannot fetch arbitrary image URLs.

No automatic scheduled model agent, video generation or customer-side action execution is included. Query aliases are exact after punctuation/spacing normalization; add known phrasings explicitly and expect clarification for other requests.
