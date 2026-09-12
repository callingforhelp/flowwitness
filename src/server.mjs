import http from "node:http";
import { pipeline } from "node:stream/promises";
import { createModuleRuntime, isModulePath } from "./module-runtime.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "./store.mjs";
import { Service, demoWorkflow } from "./service.mjs";
import { Fault, demand } from "./schema.mjs";
const moduleRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const equal = (a, b) => {
  const x = Buffer.from(a || ""),
    y = Buffer.from(b || "");
  return x.length === y.length && timingSafeEqual(x, y);
};
const loopback = (h) => ["localhost", "127.0.0.1", "::1", "[::1]"].includes(h);
const publicJob = (j) =>
  Object.fromEntries(
    Object.entries(j).filter(
      ([k]) => !["workflow", "deployment", "key"].includes(k),
    ),
  );
export async function createServer(options = {}) {
  const config = {
    root: options.root || process.cwd(),
    host: options.host || process.env.HOST || "127.0.0.1",
    port: options.port ?? Number(process.env.PORT || 4310),
    application:
      options.application ||
      process.env.FLOWWITNESS_APPLICATION ||
      "demo-reports",
    adminToken: options.adminToken ?? process.env.FLOWWITNESS_ADMIN_TOKEN,
    supportToken: options.supportToken ?? process.env.FLOWWITNESS_SUPPORT_TOKEN,
    webhookSecret:
      options.webhookSecret ?? process.env.FLOWWITNESS_WEBHOOK_SECRET,
    ttl: options.ttl ?? 86400000,
    stepTimeout: options.stepTimeout ?? 5000,
    allowedOrigins:
      options.allowedOrigins ||
      process.env.FLOWWITNESS_ALLOWED_ORIGINS?.split(",").filter(Boolean) ||
      [],
    browserOrigin:
      options.browserOrigin || process.env.FLOWWITNESS_BROWSER_ORIGIN || null,
  };
  const authenticated = !!(config.adminToken || config.supportToken);
  if (authenticated || !loopback(config.host))
    demand(
      config.adminToken?.length >= 24 &&
        config.supportToken?.length >= 24 &&
        config.adminToken !== config.supportToken,
      "Distinct admin/support tokens of at least 24 characters required",
    );
  const store = new Store(config.root, {
    application: config.application,
    stateBackend: options.stateBackend,
  });
  if (options.dataDir || process.env.FLOWWITNESS_DATA_DIR)
    store.private = path.resolve(
      options.dataDir || process.env.FLOWWITNESS_DATA_DIR,
    );
  await store.open();
  const service = new Service(store, config);
  try {
    await service.start();
  } catch (error) {
    await service.close();
    throw error;
  }
  let moduleRuntime;
  try {
    if (options.modules !== false) moduleRuntime = await createModuleRuntime({
      dir: path.join(store.private, "modules"),
      browser: options.browser, renderer: options.renderer, config: options.moduleConfig,
      workflow: options.workflowAdapter || {
        impact: input => service.impact(input),
        verify: input => service.enqueue(input.workflowId),
        publish: input => service.publish(input.workflowId, input.runId),
      },
    });
  } catch (error) { await service.close(); throw error; }
  const rates = new Map();
  const server = http.createServer(async (req, res) => {
    const request_id = randomUUID();
    const json = (status, value) => {
      res.writeHead(status, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      res.end(JSON.stringify(value));
    };
    try {
      const url = new URL(req.url, config.origin || "http://localhost");
      const p = url.pathname;
      const mutation = !["GET", "HEAD"].includes(req.method);
      const host = req.headers.host;
      const requestHosts = new Set([new URL(config.origin).host]);
      if (config.browserOrigin) requestHosts.add(new URL(config.browserOrigin).host);
      demand(
        requestHosts.has(host),
        "Host not allowed",
        "forbidden",
        403,
      );
      if (req.headers.origin)
        demand(
          [config.origin, config.browserOrigin].includes(req.headers.origin),
          "Origin not allowed",
          "forbidden",
          403,
        );
      let role = "admin";
      if (
        authenticated &&
        p.startsWith("/v1/") &&
        p !== "/v1/webhooks/github"
      ) {
        const token = req.headers.authorization?.replace(/^Bearer /, "");
        role = equal(token, config.adminToken)
          ? "admin"
          : equal(token, config.supportToken)
            ? "support"
            : null;
        demand(role, "Authentication required", "unauthorized", 401);
        if (role === "support")
          demand(
            (moduleRuntime && isModulePath(p)) ||
              p === "/v1/query" ||
              p === "/v1/images" ||
              /^\/v1\/artifacts\/[a-z0-9-]+$/.test(p),
            "Admin credential required",
            "forbidden",
            403,
          );
      }
      if (!authenticated && mutation && p !== "/v1/webhooks/github")
        demand(
          ["dashboard", "cli"].includes(req.headers["x-flowwitness-client"]),
          "Client header required",
          "forbidden",
          403,
        );
      const now = Date.now(),
        key = req.socket.remoteAddress;
      let rate = rates.get(key);
      if (!rate || now - rate.at > 60000) {
        rate = { at: now, count: 0 };
        rates.set(key, rate);
      }
      demand(++rate.count <= 600, "Rate limit exceeded", "rate_limited", 429);
      let raw = Buffer.alloc(0),
        b = {};
      if (mutation) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          demand(
            size <= 3000000,
            "Request body too large",
            "body_too_large",
            413,
          );
          chunks.push(chunk);
        }
        raw = Buffer.concat(chunks);
        if (raw.length) {
          try {
            b = JSON.parse(raw);
          } catch {
            throw new Fault("invalid_json", "Invalid JSON");
          }
        }
        demand(
          b && typeof b === "object" && !Array.isArray(b),
          "JSON object required",
        );
      }
      if (moduleRuntime && isModulePath(p)) {
        // These bindings are deployment configuration, never request body/header claims.
        const binding = options.modulePrincipals?.[role] || {};
        const principal = {
          application: config.application,
          subjectId: binding.subjectId || role,
          role: role === "support" ? "customer" : (binding.role || "operator"),
          conversationId: binding.conversationId ?? null,
        };
        demand(["operator", "agent", "customer"].includes(principal.role), "Invalid module role");
        demand(principal.role !== "customer" || (typeof principal.conversationId === "string" && principal.conversationId.length > 0), "Conversation binding required", "forbidden", 403);
        const result = await moduleRuntime.handle({ method: req.method, path: p,
          query: Object.fromEntries(url.searchParams), body: b, principal, requestId: request_id });
        if (result?.stream) {
          res.writeHead(result.status, { "content-type": result.mediaType, "cache-control": "no-store", "x-content-type-options": "nosniff" });
          await pipeline(result.stream, res);
          return;
        }
        if (result) return json(result.status, result.body);
      }
      const get = (collection, id) => {
        const item = store.data[collection][id];
        demand(item, "Not found", "not_found", 404);
        return item;
      };
      let m;
      if (p === "/health" && req.method === "GET")
        return json(200, {
          status: "ok",
          mode: authenticated ? "authenticated" : "local",
          application: config.application,
        });
      if (p === "/v1/workflows" && req.method === "GET")
        return json(200, {
          workflows: Object.values(store.data.workflows).map((w) =>
            service.enriched(w),
          ),
        });
      if (p === "/v1/workflows" && req.method === "POST")
        return json(201, { workflow: await service.put(b) });
      if ((m = p.match(/^\/v1\/workflows\/([a-z0-9-]+)$/))) {
        const w = get("workflows", m[1]);
        if (req.method === "GET")
          return json(200, { workflow: service.enriched(w) });
        if (req.method === "DELETE") {
          delete store.data.workflows[w.id];
          store.data.publications = store.data.publications.filter(
            (x) => x.workflow.id !== w.id,
          );
          await fs.rm(path.join(store.root, "workflows", w.id + ".json"), {
            force: true,
          });
          await store.save();
          return json(200, { deleted: true });
        }
      }
      if (p === "/v1/deployment") {
        if (req.method === "GET")
          return json(200, { deployment: store.data.deployment });
        if (req.method === "PUT")
          return json(200, { deployment: await service.setDeployment(b) });
      }
      if (
        (m = p.match(/^\/v1\/workflows\/([a-z0-9-]+)\/verify$/)) &&
        req.method === "POST"
      )
        return json(202, { job: publicJob(await service.enqueue(m[1])) });
      if (
        (m = p.match(/^\/v1\/workflows\/([a-z0-9-]+)\/publish$/)) &&
        req.method === "POST"
      )
        return json(200, {
          publication: await service.publish(m[1], b.run_id),
        });
      if (p === "/v1/jobs" && req.method === "GET")
        return json(200, {
          jobs: Object.values(store.data.jobs).map(publicJob),
        });
      if ((m = p.match(/^\/v1\/jobs\/([a-z0-9-]+)$/)) && req.method === "GET")
        return json(200, { job: publicJob(get("jobs", m[1])) });
      if ((m = p.match(/^\/v1\/runs\/([a-z0-9-]+)$/)) && req.method === "GET")
        return json(200, { run: get("runs", m[1]) });
      if (p === "/v1/questions" && req.method === "GET")
        return json(200, { questions: Object.values(store.data.questions) });
      if (
        (m = p.match(/^\/v1\/questions\/([a-z0-9-]+)\/resolve$/)) &&
        req.method === "POST"
      ) {
        demand(
          typeof b.answer === "string" &&
            b.answer.trim() &&
            b.answer.length <= 2000,
          "Answer required",
        );
        const q = get("questions", m[1]);
        q.answer = b.answer;
        q.status = "resolved";
        await store.save();
        return json(200, { question: q });
      }
      if (p === "/v1/impact" && req.method === "POST")
        return json(200, await service.impact(b));
      if (p === "/v1/webhooks/github" && req.method === "POST") {
        demand(
          config.webhookSecret,
          "Webhook is not configured",
          "forbidden",
          403,
        );
        demand(
          equal(
            req.headers["x-hub-signature-256"],
            "sha256=" +
              createHmac("sha256", config.webhookSecret)
                .update(raw)
                .digest("hex"),
          ),
          "Invalid signature",
          "forbidden",
          403,
        );
        const id = req.headers["x-github-delivery"];
        demand(
          typeof id === "string" &&
            id.length <= 200 &&
            req.headers["x-github-event"] === "push",
          "Push delivery required",
        );
        if (store.data.deliveries.includes(id))
          return json(200, {
            affected: [],
            unmapped: [],
            questions: [],
            duplicate: true,
          });
        demand(
          Array.isArray(b.commits) &&
            b.commits.length < 2048 &&
            (b.size === undefined ||
              (Number.isInteger(b.size) && b.size === b.commits.length)) &&
            !b.truncated &&
            !b.forced &&
            !b.created &&
            !b.deleted &&
            b.commits.every((c) =>
              ["added", "modified", "removed"].every((k) =>
                Array.isArray(c[k]),
              ),
            ),
          "Incomplete changes; use CLI impact with a full local diff",
        );
        const receipt = await service.impact({
          changed_paths: [
            ...new Set(
              b.commits.flatMap((c) => [
                ...c.added,
                ...c.modified,
                ...c.removed,
              ]),
            ),
          ],
          source_revision: b.after,
        });
        store.data.deliveries.push(id);
        store.data.deliveries = store.data.deliveries.slice(-10000);
        await store.save();
        return json(200, receipt);
      }
      if (p === "/v1/query" && req.method === "POST")
        return json(200, service.query(b));
      if (p === "/v1/images" && req.method === "POST") {
        demand(b.consent === true, "Explicit image consent required");
        demand(
          typeof b.image_base64 === "string" &&
            /^[A-Za-z0-9+/]*={0,2}$/.test(b.image_base64),
          "Raw base64 image required",
        );
        const bytes = Buffer.from(b.image_base64, "base64");
        demand(
          bytes.length > 0 && bytes.length <= 2 * 1024 * 1024,
          "Image exceeds 2 MB",
        );
        let meta;
        try {
          meta = await sharp(bytes, { limitInputPixels: 16000000 }).metadata();
        } catch {
          throw new Fault("invalid_image", "Image decode failed");
        }
        demand(
          ["png", "jpeg", "webp"].includes(meta.format) &&
            meta.width * meta.height <= 16000000 &&
            (!meta.pages || meta.pages === 1),
          "Only single-frame PNG, JPEG or WebP images accepted",
        );
        const id = await service.artifact(bytes, "upload");
        return json(201, {
          artifact: { id, expires_at: store.data.artifacts[id].expires_at },
        });
      }
      if ((m = p.match(/^\/v1\/artifacts\/([a-z0-9-]+)$/))) {
        const artifact = store.data.artifacts[m[1]];
        if (req.method === "DELETE") {
          if (artifact) {
            demand(
              artifact.application === config.application,
              "Not found",
              "not_found",
              404,
            );
            await fs.rm(path.join(store.private, artifact.file), {
              force: true,
            });
            delete store.data.artifacts[artifact.id];
            await store.save();
          }
          return json(200, { deleted: true });
        }
        demand(
          artifact &&
            artifact.application === config.application &&
            Date.parse(artifact.expires_at) > Date.now(),
          "Artifact expired",
          "not_found",
          404,
        );
        if (req.method === "GET") {
          const bytes = await fs
            .readFile(path.join(store.private, artifact.file))
            .catch((error) => {
              if (error.code === "ENOENT")
                throw new Fault("not_found", "Artifact unavailable", 404);
              throw error;
            });
          res.writeHead(200, {
            "content-type": "image/png",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          return res.end(bytes);
        }
      }
      if (p === "/v1/demo/setup" && req.method === "POST")
        return json(200, await service.demo());
      if (p === "/v1/demo/version" && req.method === "POST") {
        demand(["v1", "v2"].includes(b.version), "Version must be v1 or v2");
        return json(200, await service.demo(b.version));
      }
      if (p === "/v1/demo/repair" && req.method === "POST")
        return json(200, {
          workflow: await service.put(demoWorkflow(config.application, true)),
        });
      if (p === "/v1/graph" && req.method === "GET") {
        const nodes = [],
          edges = [];
        for (const w of Object.values(store.data.workflows)) {
          nodes.push({ id: w.id, type: "workflow", label: w.title });
          for (const s of [...w.source_paths, ...w.shared_paths]) {
            nodes.push({ id: s, type: "source", label: s });
            edges.push({ from: s, to: w.id, type: "declared_source" });
          }
          const screen = w.id + ":" + w.start_path;
          nodes.push({ id: screen, type: "screen", label: w.start_path });
          edges.push({ from: w.id, to: screen, type: "starts_at" });
          for (const s of w.steps) {
            nodes.push({
              id: w.id + ":" + s.id,
              type: "step",
              label: s.instruction,
            });
            edges.push({ from: w.id, to: w.id + ":" + s.id, type: "contains" });
          }
        }
        for (const r of Object.values(store.data.runs)) {
          nodes.push({ id: r.id, type: "run", label: r.status });
          edges.push({ from: r.workflow_id, to: r.id, type: "replay" });
        }
        return json(200, {
          nodes: [...new Map(nodes.map((n) => [n.id, n])).values()],
          edges,
        });
      }
      if (req.method === "GET" && p === "/fixture/version")
        return json(200, {
          version: store.data.fixture,
          source_revision: "fixture-" + store.data.fixture,
        });
      if (req.method === "GET" && (p === "/fixture/" || p === "/fixture")) {
        const html = (
          await fs.readFile(
            path.join(moduleRoot, "fixtures/reports.html"),
            "utf8",
          )
        )
          .replace(
            "{{MORE_HIDDEN}}",
            store.data.fixture === "v1" ? "hidden" : "",
          )
          .replace(
            "{{MENU_HIDDEN}}",
            store.data.fixture === "v2" ? "hidden" : "",
          );
        res.writeHead(200, { "content-type": "text/html" });
        return res.end(html);
      }
      if (req.method === "GET" && !p.startsWith("/v1/")) {
        const base = p.startsWith("/app") ? "app" : "site";
        let rel = decodeURIComponent(base === "app" ? p.slice(4) : p);
        if (rel === "") rel = "/";
        if (rel.endsWith("/")) rel += "index.html";
        const file = path.resolve(moduleRoot, base, "." + rel);
        demand(
          file.startsWith(path.join(moduleRoot, base) + path.sep),
          "Invalid path",
        );
        const ext = path.extname(file);
        demand(
          [
            ".html",
            ".css",
            ".js",
            ".mjs",
            ".svg",
            ".png",
            ".ico",
            ".webp",
          ].includes(ext),
          "Not found",
          "not_found",
          404,
        );
        const data = await fs.readFile(file).catch(() => {
          throw new Fault("not_found", "Not found", 404);
        });
        res.writeHead(200, {
          "content-type":
            {
              ".html": "text/html",
              ".css": "text/css",
              ".js": "text/javascript",
              ".mjs": "text/javascript",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".webp": "image/webp",
            }[ext] || "application/octet-stream",
          "x-content-type-options": "nosniff",
        });
        return res.end(data);
      }
      throw new Fault("not_found", "Not found", 404);
    } catch (e) {
      if (res.headersSent) { res.destroy(); return; }
      json(e.status || 500, {
        error: {
          code: e.code || "internal_error",
          message: e.status ? e.message : "Request failed",
        },
        request_id,
        ...(moduleRuntime && isModulePath(new URL(req.url, "http://localhost").pathname) ? { requestId: request_id } : {}),
      });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  const listen = async () => {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, config.host, resolve);
    });
    const publicOrigin =
      options.publicOrigin || process.env.FLOWWITNESS_PUBLIC_ORIGIN;
    const reachableHost = ["0.0.0.0", "::"].includes(config.host)
      ? "127.0.0.1"
      : config.host;
    config.origin =
      publicOrigin ||
      `http://${reachableHost.includes(":") ? "[" + reachableHost + "]" : reachableHost}:${server.address().port}`;
    const originURL = new URL(config.origin);
    demand(
      ["http:", "https:"].includes(originURL.protocol) &&
        originURL.origin === config.origin &&
        !originURL.username &&
        !originURL.password,
      "Public origin must be an HTTP(S) origin",
    );
    if (!config.allowedOrigins.includes(config.origin))
      config.allowedOrigins.push(config.origin);
    return api;
  };
  const api = {
    server,
    service,
    moduleRuntime,
    store,
    config,
    listen,
    close: async () => {
      await new Promise((resolve) => server.close(resolve));
      try { await service.close(); } finally { await moduleRuntime?.close(); }
    },
  };
  return api;
}
export async function startServer(options = {}) {
  const app = await createServer(options);
  try {
    return await app.listen();
  } catch (e) {
    await app.close();
    throw e;
  }
}
