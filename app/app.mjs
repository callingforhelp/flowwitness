const $ = (id) => document.getElementById(id);
const translations = new Map();
let language = "en";
try {
  language =
    localStorage.getItem("flowwitness-language") === "zh" ? "zh" : "en";
} catch {}
// Translation tokens identify UI copy without rewriting server-provided text.
function t(en, zh) {
  const key = `\uE000${translations.size}\uE001`;
  translations.set(key, { en, zh });
  return key;
}
function translated(text, locale) {
  return String(text).replace(/\uE000\d+\uE001/g, (key) => {
    const pair = translations.get(key);
    return pair ? pair[locale] : key;
  });
}
function setText(el, text) {
  const span = document.createElement("span");
  span.dataset.en = translated(text, "en");
  span.dataset.zh = translated(text, "zh");
  span.textContent = span.dataset[language];
  el.replaceChildren(span);
}
function applyLanguage() {
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-en][data-zh]").forEach((el) => {
    el.textContent = el.dataset[language];
  });
  document.querySelectorAll("[data-en-aria]").forEach((el) => {
    el.setAttribute("aria-label", el.dataset[language + "Aria"]);
  });
  document.querySelectorAll("[data-en-placeholder]").forEach((el) => {
    el.placeholder = el.dataset[language + "Placeholder"];
  });
  document.querySelectorAll("[data-en-alt]").forEach((el) => {
    el.alt = el.dataset[language + "Alt"];
  });
  $("ui-language").value = language;
}
const labels = {
  draft: t("Draft", "草稿"),
  stale: t("Needs a new check", "需要重新验证"),
  verified: t("Verified", "已验证"),
  failed: t("Failed", "失败"),
  queued: t("Queued", "排队中"),
  running: t("Browser running", "浏览器验证中"),
  passed: t("Passed", "通过"),
  interrupted: t("Interrupted", "已中断"),
  open: t("Open", "待解决"),
  resolved: t("Resolved", "已解决"),
  answered: t("Answered", "已回答"),
  clarification_needed: t("More detail needed", "需要更多信息"),
  unavailable: t("No published answer available", "暂无可用的已发布回答"),
};
let token = "",
  application = "",
  selected = null,
  run = null,
  pollGeneration = 0,
  busy = false;
const urls = new Set();
const status = (value) =>
  labels[value] ||
  `${t("Server status", "服务器状态")}: ${value || t("Unknown", "未知")}`;
function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) setText(el, text);
  if (className) el.className = className;
  return el;
}
function notice(message, error = false) {
  setText($("notice"), message);
  $("notice").className = error ? "error" : "";
  $("notice").hidden = false;
}
async function api(path, { method = "GET", body, blob = false } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== "GET") headers["X-FlowWitness-Client"] = "dashboard";
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new Error(
      t(
        "Cannot reach the server. Check that it is running, then refresh.",
        "无法连接服务器。请确认服务正在运行，然后刷新。",
      ),
    );
  }
  if (response.status === 401) {
    $("auth").hidden = false;
    throw new Error(
      t(
        "Access token required or rejected. Enter a valid token above.",
        "需要访问令牌或令牌无效。请在上方输入有效令牌。",
      ),
    );
  }
  if (!response.ok) {
    let data;
    try {
      data = await response.json();
    } catch {}
    throw new Error(
      `${t("Server error", "服务器错误")} (${response.status}): ${data?.error?.message || response.statusText}${data?.error?.code ? ` [${data.error.code}]` : ""}`,
    );
  }
  return blob ? response.blob() : response.json();
}
function controls() {
  document.querySelectorAll("button").forEach((b) => {
    b.disabled = busy;
  });
  $("verify").disabled = busy || !selected;
  $("publish-run").disabled = busy || !selected || run?.status !== "passed";
}
async function action(fn) {
  if (busy) return;
  busy = true;
  controls();
  $("notice").hidden = true;
  try {
    await fn();
  } catch (error) {
    notice(error.message, true);
  } finally {
    busy = false;
    controls();
  }
}
function revokeImages() {
  for (const url of urls) URL.revokeObjectURL(url);
  urls.clear();
}
function updateWorkflowStatus() {
  setText($("workflow-status"), status(selected.status));
  document.querySelectorAll("[data-workflow]").forEach((button) => {
    if (button.dataset.workflow === selected.id) {
      const label = button.querySelector("small");
      if (label) setText(label, status(selected.status));
    }
  });
}
async function screenshot(id, container, generation = pollGeneration) {
  try {
    const blob = await api(`/v1/artifacts/${encodeURIComponent(id)}`, {
      blob: true,
    });
    if (generation !== pollGeneration || !container.isConnected) return;
    const url = URL.createObjectURL(blob);
    urls.add(url);
    const img = node("img");
    img.dataset.enAlt = "Actual browser screenshot";
    img.dataset.zhAlt = "真实浏览器截图";
    img.alt = language === "zh" ? img.dataset.zhAlt : img.dataset.enAlt;
    img.src = url;
    const link = node(
      "a",
      t("Open full screenshot (new tab)", "打开完整截图（新标签页）"),
      "screenshot-link",
    );
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    container.append(img, link);
  } catch (error) {
    if (container.isConnected) container.append(node("p", error.message));
  }
}
async function showRun(result) {
  run = result;
  $("run-evidence").replaceChildren();
  if (!run) {
    controls();
    return;
  }
  $("run-evidence").append(
    node("h3", `${t("Browser result", "浏览器结果")}: ${status(run.status)}`),
  );
  if (run.error)
    $("run-evidence").append(
      node(
        "p",
        `${t("Check error", "验证错误")}: ${typeof run.error === "string" ? run.error : JSON.stringify(run.error)}`,
      ),
    );
  for (const step of run.steps || []) {
    const card = node("div", undefined, "evidence");
    card.append(node("strong", `${step.id} · ${status(step.status)}`));
    if (step.error)
      card.append(
        node(
          "p",
          `${t("Step error", "步骤错误")}: ${typeof step.error === "string" ? step.error : JSON.stringify(step.error)}`,
        ),
      );
    $("run-evidence").append(card);
    if (step.artifact_id) await screenshot(step.artifact_id, card);
  }
  controls();
}
async function choose(id) {
  pollGeneration++;
  revokeImages();
  run = null;
  setText($("job-status"), "");
  setText($("publication-status"), "");
  selected = (await api(`/v1/workflows/${encodeURIComponent(id)}`)).workflow;
  setText($("workflow-title"), selected.title);
  updateWorkflowStatus();
  setText(
    $("workflow-description"),
    `${selected.id} · ${selected.role} · ${selected.locale} — ${t("Workflow", "工作流程")}`,
  );
  $("workflow-json").value = JSON.stringify(
    Object.fromEntries(
      Object.entries(selected).filter(
        ([key]) => !["revision", "status", "last_run"].includes(key),
      ),
    ),
    null,
    2,
  );
  $("workflow-steps").replaceChildren(
    ...selected.steps.map((step) =>
      node("li", t(step.instruction, step.instruction_zh || step.instruction)),
    ),
  );
  document
    .querySelectorAll("[data-workflow]")
    .forEach((b) =>
      b.setAttribute("aria-current", String(b.dataset.workflow === id)),
    );
  const last = selected.last_run;
  await showRun(
    last
      ? typeof last === "object" && Array.isArray(last.steps)
        ? last
        : (
            await api(
              `/v1/runs/${encodeURIComponent(typeof last === "string" ? last : last.id)}`,
            )
          ).run
      : null,
  );
}
async function loadQuestions() {
  const { questions } = await api("/v1/questions");
  $("questions").replaceChildren(
    node("h3", t("Questions to resolve", "待解决问题")),
  );
  const relevant = questions.filter(
    (q) => !selected || q.workflow_id === selected.id,
  );
  if (!relevant.length)
    $("questions").append(
      node("p", t("No questions for this workflow.", "此流程暂无问题。")),
    );
  for (const q of relevant) {
    const card = node("div", undefined, "question-card");
    card.append(node("p", `${q.question} · ${status(q.status)}`));
    if (q.status === "open") {
      const form = node("form");
      const label = node("label", t("Resolution", "处理说明"));
      const input = node("textarea");
      input.required = true;
      label.append(input);
      const button = node("button", t("Resolve question", "解决问题"));
      form.append(label, button);
      form.onsubmit = (e) => {
        e.preventDefault();
        action(async () => {
          await api(`/v1/questions/${encodeURIComponent(q.id)}/resolve`, {
            method: "POST",
            body: { answer: input.value },
          });
          await loadQuestions();
          notice(
            t(
              "Question resolved. Run a fresh check if needed.",
              "问题已解决。如有需要，请重新验证。",
            ),
          );
        });
      };
      card.append(form);
    }
    $("questions").append(card);
  }
}
async function refresh(preferred = selected?.id) {
  const health = await api("/health");
  application = health.application;
  setText(
    $("connection"),
    health.mode === "local"
      ? t("Local trusted-user mode", "本地可信用户模式")
      : t("Authenticated server", "身份验证服务"),
  );
  const { workflows } = await api("/v1/workflows");
  $("workflows").replaceChildren();
  if (!workflows.length)
    $("workflows").append(
      node(
        "p",
        t(
          "No workflows yet. Start with the demo button above.",
          "暂无流程。请点击上方演示按钮开始。",
        ),
      ),
    );
  for (const workflow of workflows) {
    const button = node("button", workflow.title);
    button.dataset.workflow = workflow.id;
    button.append(node("small", status(workflow.status)));
    button.onclick = () =>
      action(async () => {
        await choose(workflow.id);
        await loadQuestions();
      });
    $("workflows").append(button);
  }
  const { deployment } = await api("/v1/deployment");
  for (const input of $("deployment-form").elements)
    if (input.name) input.value = deployment?.[input.name] || "";
  const id = workflows.find((w) => w.id === preferred)?.id || workflows[0]?.id;
  if (id) await choose(id);
  await loadQuestions();
}
async function verify() {
  const id = selected.id;
  const generation = ++pollGeneration;
  run = null;
  revokeImages();
  $("run-evidence").replaceChildren();
  setText($("publication-status"), "");
  let { job } = await api(`/v1/workflows/${encodeURIComponent(id)}/verify`, {
    method: "POST",
    body: {},
  });
  const deadline = Date.now() + 180000;
  while (generation === pollGeneration) {
    setText($("job-status"), `${status(job.status)} · ${job.id}`);
    if (!["queued", "running"].includes(job.status)) {
      if (job.run_id)
        await showRun(
          (await api(`/v1/runs/${encodeURIComponent(job.run_id)}`)).run,
        );
      if (job.error)
        notice(
          `${t("Browser check", "浏览器验证")}: ${typeof job.error === "string" ? job.error : JSON.stringify(job.error)}`,
          true,
        );
      await loadQuestions();
      selected = (await api(`/v1/workflows/${encodeURIComponent(id)}`))
        .workflow;
      updateWorkflowStatus();
      return;
    }
    if (Date.now() >= deadline)
      throw new Error(
        t(
          "Stopped waiting after 3 minutes. The server may still be checking; refresh to see its result.",
          "等待超过 3 分钟。服务器可能仍在验证；请刷新查看结果。",
        ),
      );
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (generation !== pollGeneration) return;
    ({ job } = await api(`/v1/jobs/${encodeURIComponent(job.id)}`));
  }
}
$("ui-language").onchange = () => {
  language = $("ui-language").value;
  try {
    localStorage.setItem("flowwitness-language", language);
  } catch {}
  applyLanguage();
};
applyLanguage();
$("refresh").onclick = () => action(() => refresh());
$("auth-form").onsubmit = (e) => {
  e.preventDefault();
  if (busy) return;
  action(async () => {
    token = $("token").value;
    $("token").value = "";
    await refresh();
    $("auth").hidden = true;
  });
};
$("demo-setup").onclick = () =>
  action(async () => {
    await api("/v1/demo/setup", { method: "POST", body: {} });
    await refresh();
    notice(
      t(
        "Demo ready. Next: run the browser check.",
        "演示已就绪。下一步：执行浏览器验证。",
      ),
    );
  });
$("verify").onclick = () => action(verify);
$("publish-run").onclick = () =>
  action(async () => {
    const { publication } = await api(
      `/v1/workflows/${encodeURIComponent(selected.id)}/publish`,
      { method: "POST", body: { run_id: run.id } },
    );
    setText(
      $("publication-status"),
      t(
        "Published successfully. Try a question below.",
        "发布成功。请在下方试提一个问题。",
      ),
    );
    const details = node("details");
    details.append(
      node("summary", t("Publication receipt", "发布回执")),
      node("pre", JSON.stringify(publication, null, 2)),
    );
    $("publication-status").append(details);
  });
$("demo-v2").onclick = () =>
  action(async () => {
    await api("/v1/demo/version", { method: "POST", body: { version: "v2" } });
    await refresh();
    notice(
      t(
        "Demo is now v2. Check the old steps to see what changed.",
        "演示已切换到 v2。验证旧步骤以查看变更影响。",
      ),
    );
  });
$("demo-repair").onclick = () =>
  action(async () => {
    await api("/v1/demo/repair", { method: "POST", body: {} });
    await refresh();
    notice(
      t(
        "Updated steps saved. Check and publish them again.",
        "更新后的步骤已保存。请重新验证并发布。",
      ),
    );
  });
$("workflow-file").onchange = () =>
  action(async () => {
    const file = $("workflow-file").files[0];
    if (file) {
      if (file.size > 1000000)
        throw new Error(t("JSON file too large", "JSON 文件过大"));
      $("workflow-json").value = await file.text();
    }
  });
$("workflow-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    let body;
    try {
      body = JSON.parse($("workflow-json").value);
    } catch {
      throw new Error(
        t("Invalid JSON. Check the syntax.", "JSON 无效，请检查语法。"),
      );
    }
    const { workflow } = await api("/v1/workflows", { method: "POST", body });
    await refresh(workflow.id);
    notice(
      t(
        "Workflow saved. Run a browser check before publishing.",
        "流程已保存。发布前请执行浏览器验证。",
      ),
    );
  });
};
$("deployment-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    await api("/v1/deployment", {
      method: "PUT",
      body: Object.fromEntries(new FormData(e.target)),
    });
    await refresh();
    notice(t("Deployment target saved.", "部署验证目标已保存。"));
  });
};
$("query-form").onsubmit = (e) => {
  e.preventDefault();
  action(async () => {
    const body = {
      application,
      question: $("question").value,
      context: { role: $("query-role").value, locale: $("query-locale").value },
    };
    if ($("query-version").value)
      body.deployment_version = $("query-version").value;
    if ($("query-environment").value)
      body.environment = $("query-environment").value;
    const file = $("query-image").files[0];
    if (file) {
      if (!$("image-consent").checked)
        throw new Error(
          t("Consent is required before uploading.", "上传前需要同意。"),
        );
      if (file.size > 2 * 1024 * 1024)
        throw new Error(
          t("Image must be 2 MB or smaller.", "图片不得超过 2 MB。"),
        );
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const { artifact } = await api("/v1/images", {
        method: "POST",
        body: { image_base64: btoa(binary), consent: true },
      });
      body.image_artifact_id = artifact.id;
    }
    const result = await api("/v1/query", { method: "POST", body });
    $("answer").replaceChildren(node("h3", status(result.status)));
    if (result.reason)
      $("answer").append(
        node("p", `${t("Server explanation", "服务器说明")}: ${result.reason}`),
      );
    if (result.question)
      $("answer").append(
        node(
          "p",
          `${t("Clarifying question", "澄清问题")}: ${result.question}`,
        ),
      );
    const list = node("ol");
    for (const step of result.steps || []) {
      const item = node("li", step.text);
      if (step.expected)
        item.append(node("p", `${t("Expected", "预期")}: ${step.expected}`));
      list.append(item);
    }
    $("answer").append(list);
    for (const evidence of result.evidence || []) {
      const card = node(
        "div",
        `${t("Evidence run", "证据验证")}: ${evidence.run_id}`,
        "evidence",
      );
      $("answer").append(card);
      if (evidence.artifact_id) await screenshot(evidence.artifact_id, card);
    }
    if (result.guidance) {
      const details = node("details");
      details.append(
        node("summary", t("Machine-readable guidance", "机器可读指引")),
        node(
          "p",
          t(
            "Instructions only; this does not operate the user’s browser.",
            "仅提供指引，不会操作用户的浏览器。",
          ),
        ),
        node("pre", JSON.stringify(result.guidance, null, 2)),
      );
      $("answer").append(details);
    }
  });
};
window.addEventListener("pagehide", () => {
  pollGeneration++;
  revokeImages();
  token = "";
});
action(() => refresh());
