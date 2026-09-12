const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const methodNotAllowed = () =>
  json({ error: { code: "method_not_allowed", message: "GET required" } }, 405);

const preview = (release, generatedAt) => ({
  kind: "flowwitness-preview-v1",
  service: "flowwitness",
  mode: "cloudflare-concept-preview",
  generatedAt,
  release,
  scenario:
    release === "v2"
      ? {
          status: "needs_review",
          label: "UI changed; review required",
          label_zh: "界面已变化；需要审核",
          note: "The previous Export location is intentionally not treated as current guidance.",
          note_zh: "旧的导出位置不会被当作当前指引。",
        }
      : {
          status: "ready_for_local_check",
          label: "Ready for a local browser check",
          label_zh: "可以进行本地浏览器检查",
          note: "This edge response describes the concept demo; it does not claim a Chromium run.",
          note_zh: "此边缘响应描述概念演示，不声称已运行 Chromium。",
        },
  workflow: {
    id: "export-report",
    question: "How do I export a report?",
    question_zh: "如何导出报告？",
    steps:
      release === "v2"
        ? [
            {
              id: "review",
              text: "Review the changed Export location before publishing guidance.",
              text_zh: "在发布指引前检查导出位置的变化。",
            },
          ]
        : [
            {
              id: "export",
              text: "Select Export report.",
              text_zh: "选择导出报告。",
            },
          ],
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      if (request.method !== "GET") return methodNotAllowed();
      return json({
        status: "ok",
        service: "flowwitness-preview",
        runtime: "cloudflare-worker",
        backend: "concept-only",
        generatedAt: new Date().toISOString(),
      });
    }
    if (url.pathname === "/api/preview") {
      if (request.method !== "GET") return methodNotAllowed();
      const release = url.searchParams.get("release") || "v1";
      if (!["v1", "v2"].includes(release))
        return json(
          { error: { code: "invalid_release", message: "Use release=v1 or release=v2" } },
          400,
        );
      return json(preview(release, new Date().toISOString()));
    }
    return env.ASSETS.fetch(request);
  },
};

export { preview };
