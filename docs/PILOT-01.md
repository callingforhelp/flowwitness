# Pilot 01: export a report

Status: **completed as an internal, non-sensitive pilot** on September 12,
2026. This is a real local browser run against the bundled application fixture,
not an external customer deployment.

The workflow is owned by the `demo-reports` application and the administrator
role. At `/fixture/`, the operator selects **Export report** and expects **CSV
is ready.** The record lives in
[`workflows/export-report.json`](../workflows/export-report.json), with the
fixture source and explicit selector/assertion.

The two release cycles were exercised by
[`test/integration.test.mjs`](../test/integration.test.mjs):

1. **v1 — publish:** the direct Export button passed real Chromium verification,
   retained a screenshot artifact, was explicitly published, and returned an
   answer through `/v1/query`.
2. **v2 — break, repair, publish:** the button moved into a More menu. The old
   selector failed in Chromium and the current answer was withheld. After the
   workflow was repaired to open More before selecting Export, Chromium passed
   again, the new evidence was published, and the answer returned two checked
   steps.

Run receipt:

```text
npm run test:integration
1 test passed: real Chromium v1 publication, v2 failure and repair
```

The fixture states that it performs no external actions and contains synthetic
report data. This pilot demonstrates the Stage 1 loop and does not establish
external adoption, authenticated-app coverage, production hosting, E2B access,
video delivery, or customer computer use. The next pilot should use one
non-sensitive workflow supplied by an external adopter.
