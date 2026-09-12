# Platform adapters

Import `src/platform/index.mjs`. Imports perform no I/O. The legacy `Store`
remains untouched; the coordinator explicitly selects these adapters.

```js
const repository = await createLocalRepository({ dir: '/private/platform-state' });
const artifacts = createLocalArtifacts({ repository });
const jobs = createJobs({ repository, config: { maxQueued: 100 } });
// Inject into modules, then await repository.close() on orderly shutdown.
```

`createMemoryRepository({clock})` implements the same interface and transaction
engine without persistence. `createFakeClock()` exposes `now`, `advance`, and
`set`; time is milliseconds. All repository methods require an exact
`{application,conversationId}` scope. Null conversation is application scope,
not a wildcard. The coordinator authenticates principals and supplies scopes.
Repositories are trusted internal adapters, not an authorization API exposed
directly to clients. `principalScope` enforces role and customer binding checks.

Local mode serializes complete read-modify-write operations, writes a private
snapshot through fsync and atomic rename, and takes an exclusive writer lock.
Another instance cannot open the directory concurrently. Orderly close permits
restart; after a crash, an operator must verify the recorded PID is stopped
before removing `writer.lock`. Never share this directory across processes or
use the legacy Store's directory. Reads currently also write a snapshot; this
simple implementation favors consistency over high throughput.

CAS versions and identity fields are server managed. Queries use allowlisted
scalar equality, substring search and stable createdAt/id pagination, with
scope/filter-bound cursors. Plain writes cannot mutate job transitions or
assert evidence verification/publication. Trusted evidence validation and
publication remain separate coordinator responsibilities; this adapter does
not provide a way to turn unverified evidence into verified evidence.

Jobs deduplicate by exact scope, kind and canonical input (including configured
deadline duration). Claims atomically choose the oldest eligible job, check all
capabilities, increment attempts and issue a new fencing token. Leases default
to 60 seconds and cap at 120 seconds; heartbeat defaults to 20 seconds at the
caller. Cancellation invalidates the token immediately. Expired deadlines and
exhausted attempts are swept on claim, including jobs lacking a connected
worker. A scheduler must call claim periodically if prompt terminal visibility
is required. Facade claims require an enabled AgentCapability registration;
operators provision registrations. The facade enforces an atomic active-job
quota, scoped inputs, result job association and optional `validateResult`.
Injected domain validators must check evidence receipts and provenance before
completion/publication. Completion alone never verifies or publishes evidence.

Artifacts are private, size-limited bytes stored as base64 in the private local
snapshot, rather than portable domain records. This is intended for modest
local workloads (20 MiB maximum per artifact). Upload validates the job's live
token within the same transaction as persistence. Metadata expires at 24 hours
by default; a shorter TTL is injectable. `link` returns a coordinator-relative
URL, not a storage URL. The coordinator must authenticate every fetch and call
`artifacts.readLink(scope,id,token)`; `read` is for trusted scoped consumers.
Every new fetch checks expiry and revocation. Revocation clears bytes and all
links. Already delivered bytes cannot be recalled. Expired bytes remain private
on disk until retention cleanup; expiry denies delivery immediately.

## InsForge boundary

Apply `migrations/20260912074747_platform-records.sql` only to an authorized
isolated backend first. `createInsForgeRepository({client})` accepts an
`@insforge/sdk` admin client; `createInsForgeAdminRepository({baseUrl,apiKey})`
loads the SDK explicitly. Credentials are caller-supplied and never persisted.
The adapter is coordinator-only. RPC execution is restricted to
`project_admin`; anon/authenticated cannot submit state transitions. RLS allows
registered operator/agent members to read exact scoped domain records.
Customers receive only coordinator-authorized responses. Memberships and
private artifact state cannot be mutated by user SDK clients.

The RPC reads a consistent scope snapshot from normalized, indexed record rows
and commits under a locked scope revision CAS. A losing transaction reruns the
same local transition code using database time, up to 20 attempts. Commit-time
lease checks fence slow round trips. This intentionally serializes a scope;
it is an initial correctness adapter, not a high-volume cloud implementation.
Private-state JSON is reserved for adapter metadata; cloud storage/bucket
delivery is not implemented or claimed. Use local artifacts with the local
repository. SQL deployment, authenticated RLS and real concurrent SDK behavior
require the integration gate below before production use.

## Focused checks

`node --test test/platform.test.mjs` covers memory and durable repository races,
scope isolation, pagination, stale versions/tokens, idempotency, restart,
cancellation, deadlines, exhaustion, registration/quota and artifact expiry /
revocation. The InsForge smoke case is skipped unless
`PLATFORM_INSFORGE_TEST=1`, `INSFORGE_URL`, and `INSFORGE_API_KEY` are provided for
an isolated migrated backend. This pass did not contact a cloud service or
apply SQL. Coordinator HTTP delivery and domain validation need their own
integration checks.
