# External pilot checklist

This checklist is for one non-sensitive preview application. It exercises the
Stage 1 change-to-answer loop without customer production data, credentials or
automatic computer control. The pilot is evidence gathering; it is not a
production certification.

## Before the first run

- Choose one application owner and one administrator workflow that customers
  actually ask about.
- Provide a preview/test origin with seeded, disposable data. Do not use a
  production account, customer PII, payment data or reusable credentials.
- Add a deployment identity endpoint that returns
  `{"version":"<release>","source_revision":"<commit>"}`.
- Author and validate one workflow with stable step IDs, source paths, safe
  selectors, expected outcomes and English/Chinese text where needed.
- Choose the existing support chat or backend that will call `/v1/query`.
  Keep the support token in that backend; do not put it in a browser widget.
- Review `redact_selectors` and image consent with the application owner.

## Release A

1. Import the workflow and set the preview deployment identity.
2. Run the real browser verification and inspect every screenshot.
3. Resolve any generated review question and explicitly publish the run.
4. Ask the support backend the exact known question in English and Chinese.
5. Record setup time, warm query latency, answer correctness and artifact expiry.

## Release B change and repair

1. Make one visible UI change that moves or renames the documented control.
2. Push the commit through the configured GitHub webhook, or run CLI impact
   for the complete base/head range if the webhook payload is incomplete.
3. Confirm the old published answer is withheld for the new deployment identity.
4. Run verification against the changed preview and retain the failed evidence.
5. Repair the workflow, run verification again, resolve the new question and
   explicitly publish the repaired release.
6. Ask the same support questions again and confirm only the repaired steps are
   returned. Confirm an old release request still receives its matching guide.

## Exit evidence

The pilot is complete when it has two release receipts, a stale-answer
suppression receipt, a repaired publication receipt, support query receipts in
both languages, and a private-artifact access/expiry check. Record:

- minutes to configure the first workflow and minutes to repair it;
- warm and cold-start query latency, with the cold start called out separately;
- relevant versus irrelevant impact alerts;
- whether the support answer was correct, a clarification or unavailable;
- screenshot retention, redaction and deletion/expiry results;
- operator feedback and whether the owner would keep the workflow enabled.

Stop the pilot if production credentials, personal data, unrestricted network
access or customer-side computer execution would be required. File that need as
a separate Stage 2 proposal.

The shared ARM64 EC2 pilot route can run the real browser steps and is suitable
for a bounded rehearsal or adopter pilot. Its named Cloudflare route is
`https://flowwitness-pilot.useflinter.com/`; it is stable for sponsor-pilot
access but still not production certification. The original free
512 MB hosted fallback still has a browser-capacity gate, so use the shared
route or an approved browser worker for external runs and keep the hosted
service's scale-to-zero cold-start behavior in the recorded latency metrics.
