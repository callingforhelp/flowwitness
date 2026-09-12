import { chromium } from "playwright";
import { startServer } from "../src/server.mjs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "flowwitness-dashboard-"));
const app = await startServer({ root, port: 0, stepTimeout: 1000 });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(app.config.origin + "/app/");
  await page.locator("#demo-setup").click();
  await page.locator("#verify:not([disabled])").waitFor();
  await page.locator("#verify").click();
  await page
    .locator("#publish-run:not([disabled])")
    .waitFor({ timeout: 30000 });
  await page.locator("#run-evidence img").waitFor();
  await page.locator("#publish-run").click();
  await page
    .locator("#publication-status")
    .filter({ hasText: /Published/ })
    .waitFor();
  await page.locator("#ask-submit").click();
  await page.locator("#answer ol li").waitFor();
  assert.equal(await page.locator("#answer ol li").count(), 1);
  await page
    .locator("details")
    .filter({ has: page.locator("#demo-v2") })
    .locator("summary")
    .click();
  await page.locator("#demo-v2").click();
  await page.locator("#verify:not([disabled])").waitFor();
  await page.locator("#ask-submit").click();
  await page
    .locator("#answer")
    .filter({ hasText: /No published/ })
    .waitFor();
  assert.equal(await page.locator("#answer ol li").count(), 0);
  await page.locator("#verify").click();
  await page
    .locator("#job-status")
    .filter({ hasText: /Failed/ })
    .waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#publish-run").isDisabled(), true);
  await page.locator("#demo-repair").click();
  await page.locator("#verify:not([disabled])").waitFor();
  await page.locator("#verify").click();
  await page
    .locator("#publish-run:not([disabled])")
    .waitFor({ timeout: 30000 });
  await page.locator("#publish-run").click();
  await page.locator("#ask-submit:not([disabled])").waitFor();
  await page.locator("#ask-submit").click();
  await page.locator("#answer ol li").nth(1).waitFor();
  assert.match(await page.locator('[data-workflow="export-report"] small').innerText(), /Verified/);
  const screenshotLink = page.locator('#run-evidence a').first();
  assert.match(await screenshotLink.getAttribute('href'), /^blob:/);
  const popupPromise = page.waitForEvent('popup');
  await screenshotLink.click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await popup.close();
  await page.locator('#ui-language').selectOption('zh');
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.match(await page.locator('#workflow-status').innerText(), /已验证/);
  await page.locator('#query-locale').selectOption('zh-CN');
  await page.locator('#question').fill('如何导出报告？');
  await page.locator('#ask-submit').click();
  await page.locator('#answer ol li').filter({hasText:'选择更多'}).waitFor();
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `overflow ${width}`,
    );
  }
  await page.screenshot({
    path: path.join(os.tmpdir(), "flowwitness-runtime-dashboard.png"),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    "PASS: dashboard setup, real replay/screenshots, publish/query, actual failure, repair and responsive layout",
  );
} finally {
  await browser.close();
  await app.close();
  await fs.rm(root, { recursive: true, force: true });
}

const authRoot=await fs.mkdtemp(path.join(os.tmpdir(),'flowwitness-ui-auth-'));
const admin='ui-test-admin-'+ 'a'.repeat(40);
const authenticated=await startServer({root:authRoot,port:0,adminToken:admin,supportToken:'s'.repeat(40)});
const authBrowser=await chromium.launch();
try{
 const page=await authBrowser.newPage();
 await page.goto(authenticated.config.origin+'/app/');
 await page.locator('#auth').waitFor();
 await page.locator('#token').fill('wrong-test-token');
 await page.locator('#auth-form button').click();
 await page.locator('#auth-form button:not([disabled])').waitFor();
 assert(await page.locator('#auth').isVisible());
 await page.locator('#token').fill(admin);
 await page.locator('#auth-form button').click();
 await page.locator('#auth').waitFor({state:'hidden'});
 assert.equal(await page.locator('#token').inputValue(),'');
 assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('ui-test-admin'))),false);
 await page.reload();
 await page.locator('#auth').waitFor();
 console.log('PASS: dashboard 401, retry, memory-only credentials and reload logout');
}finally{await authBrowser.close();await authenticated.close();await fs.rm(authRoot,{recursive:true,force:true});}
