import { chromium } from "playwright";
import { demand } from "./schema.mjs";
export async function replay(
  w,
  d,
  {
    artifact,
    timeout = 90000,
    stepTimeout = 5000,
    browserBaseUrl = d.base_url,
  },
) {
  // The hosted Linux service runs as an unprivileged-by-platform container with
  // a small default /dev/shm. Keep the browser launch deterministic there as
  // well as in local Docker/CI: Chromium uses /tmp instead of the tiny shared
  // memory mount, and the root-based image does not attempt the SUID sandbox.
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"],
  });
  const browserOrigin = new URL(browserBaseUrl).origin;
  let timer;
  const run = {
    workflow_id: w.id,
    revision: w.revision,
    deployment: structuredClone(d),
    started_at: new Date().toISOString(),
    status: "failed",
    steps: [],
  };
  try {
    await Promise.race([
      (async () => {
        const context = await browser.newContext({ serviceWorkers: "block" });
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === browserOrigin
            ? route.continue()
            : route.abort(),
        );
        const page = await context.newPage();
        page.setDefaultTimeout(stepTimeout);
        const identity = async () => {
          const p = await context.newPage();
          try {
            const response = await p.goto(
              new URL(d.identity_path, browserBaseUrl).href,
              { timeout: stepTimeout },
            );
            demand(response?.ok(), "Identity request failed");
            const v = await response.json();
            demand(
              v.version === d.version &&
                v.source_revision === d.source_revision,
              "Deployment identity changed",
            );
          } finally {
            await p.close();
          }
        };
        await identity();
        await page.goto(new URL(w.start_path, browserBaseUrl).href, {
          timeout: stepTimeout,
        });
        for (const s of w.steps) {
          const result = { id: s.id, status: "failed" };
          run.steps.push(result);
          try {
            const target = page.locator(s.action.selector);
            if (s.action.type === "click") await target.click();
            if (s.action.type === "fill") {
              const safe = await target.evaluate(
                (el) =>
                  el.tagName === "TEXTAREA" ||
                  (el.tagName === "INPUT" &&
                    ["text", "search", "email", "url", "tel"].includes(
                      el.type,
                    )),
              );
              demand(safe, "Unsafe fill target");
              await target.fill(s.action.text);
            }
            const a = s.assertion;
            if (a.type === "visible")
              await page.locator(a.selector).waitFor({ state: "visible" });
            if (a.type === "text") {
              await page
                .locator(a.selector)
                .filter({ hasText: a.text })
                .waitFor({ state: "visible" });
            }
            if (a.type === "url")
              await page.waitForURL(
                (url) =>
                  url.origin === browserOrigin &&
                  url.pathname === a.path,
              );
            const png = await page.screenshot({
              mask: [
                ...new Set([
                  "input[type=password]",
                  "[data-private]",
                  ...w.redact_selectors,
                ]),
              ].map((s) => page.locator(s)),
              fullPage: false,
            });
            result.artifact_id = await artifact(png);
            result.status = "passed";
          } catch {
            result.error = "Action or assertion failed";
            try {
              result.artifact_id = await artifact(
                await page.screenshot({
                  mask: [
                    ...new Set([
                      "input[type=password]",
                      "[data-private]",
                      ...w.redact_selectors,
                    ]),
                  ].map((s) => page.locator(s)),
                  timeout: stepTimeout,
                }),
              );
            } catch {}
            throw new Error("Step failed");
          }
        }
        await identity();
        run.status = "passed";
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Job deadline exceeded")),
          timeout,
        );
      }),
    ]);
  } catch (e) {
    run.error =
      e.message === "Job deadline exceeded"
        ? e.message
        : "Replay failed: action, assertion, or deployment identity did not match";
  } finally {
    clearTimeout(timer);
    await browser.close();
    run.finished_at = new Date().toISOString();
  }
  return run;
}
