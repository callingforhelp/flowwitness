import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const emptyState = () => ({
  workflows: {},
  jobs: {},
  runs: {},
  publications: [],
  questions: {},
  artifacts: {},
  deliveries: [],
  deployment: null,
  fixture: "v1",
});

export class Store {
  constructor(root, { application = "demo-reports", stateBackend } = {}) {
    this.root = root;
    this.application = application;
    this.private = path.join(root, ".flowwitness/private");
    this.data = emptyState();
    this.stateBackend =
      stateBackend || process.env.FLOWWITNESS_STATE_BACKEND || "local";
    this.remoteVersion = null;
    this.tail = Promise.resolve();
  }
  async open() {
    await fs.mkdir(this.private, { recursive: true, mode: 0o700 });
    this.lock = await fs
      .open(path.join(this.private, "writer.lock"), "wx", 0o600)
      .catch(() => {
        throw new Error(
          "State is locked by another process; remove writer.lock only after verifying its owner has stopped",
        );
      });
    await this.lock.writeFile(String(process.pid));
    try {
      if (this.stateBackend === "insforge") await this.openRemote();
      else
        this.data = JSON.parse(
          await fs.readFile(path.join(this.private, "state.json"), "utf8"),
        );
    } catch (e) {
      if (e.code !== "ENOENT") {
        await this.close();
        throw e;
      }
    }
    this.data = { ...emptyState(), ...this.data };
    for (const j of Object.values(this.data.jobs))
      if (["queued", "running"].includes(j.status)) {
        j.status = "interrupted";
        j.error = "Service restarted";
      }
    await this.save();
    return this;
  }

  async openRemote() {
    const baseUrl =
      process.env.FLOWWITNESS_INSFORGE_URL || process.env.INSFORGE_URL;
    const apiKey =
      process.env.FLOWWITNESS_INSFORGE_API_KEY || process.env.INSFORGE_API_KEY;
    if (!baseUrl || !apiKey)
      throw new Error(
        "InsForge state backend requires FLOWWITNESS_INSFORGE_URL and FLOWWITNESS_INSFORGE_API_KEY",
      );
    const { createAdminClient } = await import("@insforge/sdk");
    this.remoteClient = createAdminClient({ baseUrl, apiKey });
    const { data, error } = await this.remoteClient.database.rpc(
      "flowwitness_state_load",
      { p_application: this.application },
    );
    if (
      error ||
      !data ||
      !Number.isInteger(Number(data.version)) ||
      !data.state
    )
      throw new Error("InsForge state load failed");
    this.remoteVersion = Number(data.version);
    this.data = data.state;
    for (const artifact of Object.values(this.data.artifacts || {})) {
      if (!artifact?.file || path.basename(artifact.file) !== artifact.file)
        throw new Error("Invalid persisted artifact path");
      if (typeof artifact.bytes === "string") {
        await fs.writeFile(
          path.join(this.private, artifact.file),
          Buffer.from(artifact.bytes, "base64"),
          { mode: 0o600 },
        );
        delete artifact.bytes;
      }
    }
  }

  async remoteSnapshot(snapshot) {
    const copy = structuredClone(snapshot);
    for (const artifact of Object.values(copy.artifacts || {})) {
      if (!artifact?.file || path.basename(artifact.file) !== artifact.file)
        throw new Error("Invalid artifact path");
      const file = await fs.readFile(path.join(this.private, artifact.file));
      artifact.bytes = file.toString("base64");
    }
    const maxBytes = Number(process.env.FLOWWITNESS_STATE_MAX_BYTES || 8000000);
    if (Buffer.byteLength(JSON.stringify(copy)) > maxBytes)
      throw new Error("Persisted state exceeds configured size limit");
    return copy;
  }

  async writeLocal(snapshot) {
    const tmp = path.join(this.private, `${randomUUID()}.tmp`);
    await fs.writeFile(tmp, JSON.stringify(snapshot, null, 2), { mode: 0o600 });
    await fs.rename(tmp, path.join(this.private, "state.json"));
  }

  save() {
    const snapshot = structuredClone(this.data);
    this.tail = this.tail.then(async () => {
      await this.writeLocal(snapshot);
      if (this.stateBackend !== "insforge") return;
      const state = await this.remoteSnapshot(snapshot);
      const { data, error } = await this.remoteClient.database.rpc(
        "flowwitness_state_commit",
        {
          p_application: this.application,
          p_version: this.remoteVersion,
          p_state: state,
        },
      );
      if (error || data !== true)
        throw new Error("InsForge state commit lost its revision");
      this.remoteVersion += 1;
    });
    return this.tail;
  }
  async close() {
    await this.tail;
    if (this.lock) {
      await this.lock.close();
      this.lock = null;
      await fs.unlink(path.join(this.private, "writer.lock"));
    }
  }
}
