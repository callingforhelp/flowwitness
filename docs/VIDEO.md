# Video Studio

Compose `createModule` from `src/modules/video/index.mjs` with scoped repository,
artifacts, jobs and an optional renderer. Compose `createFFmpegRenderer` from
`src/adapters/ffmpeg/index.mjs` with the same private artifacts adapter. Imports
perform no I/O. FFmpeg and ffprobe must be installed locally with libx264 and
drawtext support. Set trusted `fontFile` to a font with Chinese glyphs for Chinese
captions; the OS default font does not guarantee complete glyph coverage.

Operators create projects using exactly one `evidenceBundleId` or uploaded
`sourceArtifactId`, `locale: en|zh`, and `edit`. Imported recordings remain
unverified and cannot be published. No model service, TTS, credentials or cloud
runtime is needed. Narration is an optional uploaded audio artifact.

Trim and segments use source milliseconds. Segments must lie within trim and
are concatenated in array order. Captions and highlights use output milliseconds.
Highlights use normalized frame coordinates. Logo and narration accept opaque
artifact IDs only; paths and URLs are rejected. Colors use `#RRGGBB`. Caption text
is written to private UTF-8 files with FFmpeg expansion disabled, preserving the
original English or Chinese text without interpreting filter expressions.

Public methods are `create`, `get`, `update`, `render`, `publish`, and `handle`.
Routes follow MODULE-CONTRACT.md. PATCH requires `expectedVersion`; render requires
`idempotencyKey`. A leased worker calls `runRender(principal, {id, token})`.
`renderer.probe(scope, {id})` returns duration; `renderer.render(plan,
{scope, signal, timeoutMs})` returns private bytes and media type. Jobs must enforce
lease fencing for artifact puts and completion. Editing revokes the old output
and clears publication. Rendering never publishes or upgrades verification.

Publication is operator-only and rechecks evidence and output expiry/revocation,
plus the exact edit hash. Customer reads recheck these gates. The trusted
repository/validator must maintain evidence status when target revisions change;
caller-supplied verification is rejected. Delivery uses the injected artifact
adapter's revocable expiring links, never a public storage URL. That adapter must
enforce revocation and current evidence eligibility on every delivery; this
module cannot retract bytes already downloaded.

The adapter spawns processes without a shell, permits local-file input protocols
only, strips metadata, bounds input/output bytes (128 MiB), source dimensions
(3840×2160), output duration (15 minutes), and execution (120 seconds). It kills
encoding on abort and removes private temporary directories on every exit.
Artifact readers should provide cancellation-aware streams; hung arbitrary
adapter promises cannot be forcibly cancelled by JavaScript.

Focused checks: `node --test test/video*.mjs`. Fixtures use fake dependencies and
one tiny local FFmpeg render; they provide no cloud, deployment, or font-glyph
coverage proof. Configure OS process isolation/resource limits for untrusted
media in production.
