/**
 * In-memory snapshot store with the same interface as `DurableJsonStore`.
 *
 * Used by module acceptance fixtures that must run without a filesystem, and by
 * tests that need the repository's atomicity guarantees without disk I/O.
 */
import { Mutex } from "./durable-store.mjs";
import { cloneJson } from "./records.mjs";

export class MemoryJsonStore {
  constructor({ emptySnapshot }) {
    this.emptySnapshot = emptySnapshot;
    this.mutex = new Mutex();
    this.snapshot = null;
  }

  async open() {
    if (this.snapshot === null) this.snapshot = this.emptySnapshot();
    return this;
  }

  async read() {
    return cloneJson(this.snapshot ?? this.emptySnapshot());
  }

  async write(snapshot) {
    this.snapshot = cloneJson(snapshot);
  }

  async close() {
    await this.mutex.run(async () => {});
  }
}
