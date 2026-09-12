# Agents module

Operators register agent capabilities and enqueue idempotent investigations using issueId and idempotencyKey. Agents claim registered capabilities and use their own current lease token for heartbeat and results. The injected jobs facade owns atomic fencing, quotas, retries and result validation. Cancellation prevents late results. No model runtime is imported.

See [module contract](MODULE-CONTRACT.md) for methods and routes. Inject repository, jobs and artifacts as applicable; no module import performs I/O. Unknown paths return null; unsupported methods return 405. Errors include requestId and fixed public messages.
