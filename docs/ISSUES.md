# Issues module

Issue creation and messages preserve en/zh content and trusted author identity. Customers require a conversation binding. Operators select a conversation or explicit null application scope. Resolution requires an operator, matching scoped resolution entry, and expectedVersion. get returns the issue with messages.

See [module contract](MODULE-CONTRACT.md) for methods and routes. Inject repository, jobs and artifacts as applicable; no module import performs I/O. Unknown paths return null; unsupported methods return 405. Errors include requestId and fixed public messages.
