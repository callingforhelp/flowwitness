import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@insforge/sdk";
import { Store } from "../src/store.mjs";

test(
  "InsForge store preserves state and private artifact bytes across reopen",
  { skip: process.env.FLOWWITNESS_REMOTE_STORE_TEST !== "1", timeout: 30000 },
  async () => {
    assert.ok(process.env.FLOWWITNESS_INSFORGE_URL);
    assert.ok(process.env.FLOWWITNESS_INSFORGE_API_KEY);
    const application = `remote-test-${randomUUID()}`;
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "flowwitness-remote-"));
    const file = "artifact.png";
    try {
      const first = new Store(dir, { application, stateBackend: "insforge" });
      await first.open();
      first.data.workflows.example = { id: "example" };
      await fs.writeFile(path.join(first.private, file), Buffer.from([1, 2, 3]));
      first.data.artifacts.one = {
        id: "one",
        file,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      };
      await first.save();
      await first.close();

      const second = new Store(dir, { application, stateBackend: "insforge" });
      await second.open();
      assert.equal(second.data.workflows.example.id, "example");
      assert.deepEqual(
        await fs.readFile(path.join(second.private, file)),
        Buffer.from([1, 2, 3]),
      );
      await second.close();
    } finally {
      const admin = createAdminClient({
        baseUrl: process.env.FLOWWITNESS_INSFORGE_URL,
        apiKey: process.env.FLOWWITNESS_INSFORGE_API_KEY,
      });
      await admin.database
        .from("flowwitness_state")
        .delete()
        .eq("application", application);
      await fs.rm(dir, { recursive: true, force: true });
    }
  },
);
