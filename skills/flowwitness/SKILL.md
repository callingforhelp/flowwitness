---
name: flowwitness
description: Record customer workflows for a web application, check their instructions in a browser, and query published FlowWitness guidance after UI changes. Use when maintaining customer operation guides alongside code.
---

# FlowWitness

Use the project's installed `flowwitness` CLI, or `node /path/to/flowwitness/bin/flowwitness.mjs`. Read its `--help` before the first invocation; do not assume an npm package has been published. The service URL is `FLOWWITNESS_URL`; tokens belong in local environment configuration and must not be printed.

## Record or update a customer workflow

Identify the customer's task, role, application route, expected outcome and relevant source files. Inspect the actual UI/source. Ask for a missing fact that changes the instructions; do not infer permissions or deployment identity from a screenshot.

Author a workflow JSON using the installed repository's `docs/RUNTIME-CONTRACT.md` Workflow object. Keep stable IDs, relative source paths, semantic customer instructions, and observable assertions. The initial runtime accepts explicit click/fill/assert steps; it does not discover all UI behavior automatically. Do not record credentials or destructive real-customer actions. Use operator-provided test data and deployment.

Validate and import with the CLI. Run verification and inspect the terminal run result and step evidence. A failed job needs a diagnosed workflow/UI change, not repeated identical retries. Updating a JSON record is not browser verification; passing verification is not publication. Publish only within the user's existing authorization after checking the result.

## After a code change

Use `impact --base <known-base-ref> --head <known-head-ref>` in the actual application repository. Inspect affected workflows and unknown source coverage. A push describes source changes; it does not prove what production deployed. Verify against the configured matching deployment, resolve missing facts, then publish an approved result. Do not change the user's deployment or Git hooks without task authorization.

## Help a customer

Query the service for the task and trustworthy application/role/version context. Return its published steps and evidence. When the service asks for clarification or reports unavailable instructions, preserve that result. Do not fill the gap with invented click locations. Image upload provides a private reference; this runtime does not infer tasks from pixels.

The response's guidance JSON is a FlowWitness format, not a universal computer-use protocol. Providing steps does not authorize taking control of a customer's machine. Native computer-use adapters and walkthrough video generation are outside this initial runtime.
