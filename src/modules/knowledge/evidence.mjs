// Trusted evidence validator for the knowledge module. Status is always
// computed, never asserted by callers: it derives from the referenced
// EvidenceBundle records (themselves produced by the trusted execution
// pipeline), the target revision/context, expiry, and artifact availability.
// Deterministic and model-free.
const RANK = { verified: 0, unverified: 1, stale: 2, expired: 3, failed: 4 };

export function createEvidenceValidator({ repository, artifacts, now }) {
  const nowMs = () => Number(now());

  // Evaluate one bundle against the entry that cites it. Fail closed: any
  // missing, revoked, or expired evidence downgrades the entry.
  async function bundleStatus(scope, entry, bundle) {
    if (!bundle) return "unverified";
    if (bundle.application !== scope.application || (bundle.conversationId ?? null) !== scope.conversationId) return "unverified";
    if (!entry.release || !bundle.target?.revision || !bundle.validatorVersion || !bundle.jobId) return "unverified";
    const job = await repository.get(scope, "investigationJobs", bundle.jobId);
    if (!job || job.status !== "succeeded" || job.cancelRequestedAt || job.resultRef?.collection !== "evidenceBundles" || job.resultRef?.id !== bundle.id) return "unverified";
    if (bundle.status === "failed") return "failed";
    if (bundle.status === "expired") return "expired";
    if (bundle.status === "stale") return "stale";
    const expiry = Date.parse(bundle.expiresAt ?? "");
    if (!Number.isFinite(expiry) || expiry <= nowMs()) return "expired";
    if (
      entry.release &&
      bundle.target?.revision &&
      bundle.target.revision !== entry.release
    )
      return "stale";
    const artifactIds = Array.isArray(bundle.artifactIds)
      ? bundle.artifactIds
      : [];
    if (artifactIds.length) {
      if (!artifacts || typeof artifacts.get !== "function") return "unverified";
      for (const id of artifactIds) {
        const meta = await artifacts.get(scope, id);
        if (!meta || meta.revokedAt) return "expired";
        if (!meta.sha256 || (bundle.artifactHashes && bundle.artifactHashes[id] !== meta.sha256)) return "failed";
        const artifactExpiry = Date.parse(meta.expiresAt ?? "");
        if (!Number.isFinite(artifactExpiry) || artifactExpiry <= nowMs())
          return "expired";
      }
    }
    return bundle.status === "verified" ? "verified" : "unverified";
  }

  // Aggregate with a fixed precedence: failed > expired > stale > unverified
  // > verified. An entry is verified only when every cited bundle is current,
  // verified, and matches the entry release/context.
  async function validate(scope, entry) {
    const ids = Array.isArray(entry.evidenceBundleIds)
      ? entry.evidenceBundleIds
      : [];
    if (!ids.length) return "unverified";
    let worst = "verified";
    for (const id of ids) {
      const bundle = await repository.get(scope, "evidenceBundles", id);
      const status = await bundleStatus(scope, entry, bundle);
      if (RANK[status] > RANK[worst]) worst = status;
      if (worst === "failed") break;
    }
    return worst;
  }

  return { validate };
}
