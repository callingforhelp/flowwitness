import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
export class Store {
  constructor(root) {
    this.root = root;
    this.private = path.join(root, ".flowwitness/private");
    this.data = {
      workflows: {},
      jobs: {},
      runs: {},
      publications: [],
      questions: {},
      artifacts: {},
      deliveries: [],
      deployment: null,
      fixture: "v1",
    };
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
      this.data = JSON.parse(
        await fs.readFile(path.join(this.private, "state.json"), "utf8"),
      );
    } catch (e) {
      if (e.code !== "ENOENT") {
        await this.close();
        throw e;
      }
    }
    for (const j of Object.values(this.data.jobs))
      if (["queued", "running"].includes(j.status)) {
        j.status = "interrupted";
        j.error = "Service restarted";
      }
    await this.save();
    return this;
  }
  save() {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.tail = this.tail.then(async () => {
      const tmp = path.join(this.private, `${randomUUID()}.tmp`);
      await fs.writeFile(tmp, snapshot, { mode: 0o600 });
      await fs.rename(tmp, path.join(this.private, "state.json"));
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
