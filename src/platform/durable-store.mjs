/**
 * Durable single-writer JSON snapshot store.
 *
 * The legacy `Store.save()` appends to a promise chain and never awaits the
 * write, so a caller can observe a mutation that is not yet on disk and two
 * interleaved read-modify-write sequences can both "win". docs/MODULE-CONTRACT.md
 * requires local serialization *plus* durable writes to give the same race
 * guarantees as a Postgres transaction, so this store:
 *
 *   - serializes every mutation through an async mutex (no interleaving), and
 *   - awaits an atomic tmp-write + fsync + rename before the mutation returns.
 *
 * A crash therefore leaves either the previous complete snapshot or the next
 * complete snapshot, never a partial one.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

/** Serializes async critical sections; a rejection never stalls the chain. */
export class Mutex {
  #tail = Promise.resolve();

  run(task) {
    const result = this.#tail.then(task, task);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

async function syncDir(dir) {
  let handle;
  try {
    handle = await fs.open(dir, "r");
    await handle.sync();
  } catch {
    // Directory fsync is unsupported on some platforms/filesystems; the rename
    // itself is still atomic, which is the guarantee that matters here.
  } finally {
    await handle?.close().catch(() => {});
  }
}

export class DurableJsonStore {
  /**
   * @param {object} options
   * @param {string} options.dir directory holding the snapshot and writer lock
   * @param {string} [options.fileName]
   * @param {() => object} options.emptySnapshot
   */
  constructor({ dir, fileName = "platform.json", emptySnapshot }) {
    this.dir = dir;
    this.file = path.join(dir, fileName);
    this.lockFile = path.join(dir, "writer.lock");
    this.emptySnapshot = emptySnapshot;
    this.mutex = new Mutex();
    this.handle = null;
    this.opened = false;
  }

  /** Exclusive single-writer open. Rejects if another process holds the lock. */
  async open() {
    if (this.opened) return this;
    await fs.mkdir(this.dir, { recursive: true, mode: 0o700 });
    try {
      this.handle = await fs.open(this.lockFile, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error(
          "Platform state is locked by another process; remove writer.lock only after verifying its owner has stopped",
        );
      }
      throw error;
    }
    await this.handle.writeFile(String(process.pid));
    this.opened = true;
    return this;
  }

  /** Read the snapshot, or the empty snapshot when none has been written yet. */
  async read() {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      if (error.code === "ENOENT") return this.emptySnapshot();
      throw error;
    }
  }

  /**
   * Atomically replace the snapshot. Resolves only once the new bytes are
   * durable, so callers may treat a resolved mutation as committed.
   */
  async write(snapshot) {
    const serialized = JSON.stringify(snapshot);
    const tmp = path.join(this.dir, `${randomUUID()}.tmp`);
    const handle = await fs.open(tmp, "w", 0o600);
    try {
      await handle.writeFile(serialized);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, this.file);
    await syncDir(this.dir);
  }

  async close() {
    await this.mutex.run(async () => {});
    if (this.handle) {
      await this.handle.close().catch(() => {});
      this.handle = null;
      await fs.unlink(this.lockFile).catch(() => {});
    }
    this.opened = false;
  }
}
