/**
 * Time source for the platform adapters.
 *
 * Every adapter takes an injected clock so leases, deadlines, cursors, and
 * artifact expiry can be exercised deterministically in tests without sleeping.
 * `now()` returns milliseconds since the Unix epoch.
 */
export const systemClock = {
  now: () => Date.now(),
};

export function createFakeClock(start = Date.UTC(2026, 0, 1, 0, 0, 0)) {
  let current = start;
  return {
    now: () => current,
    set(ms) {
      if (!Number.isFinite(ms)) throw new TypeError("Clock time must be a number");
      current = ms;
      return current;
    },
    advance(ms) {
      if (!Number.isFinite(ms)) throw new TypeError("Clock advance must be a number");
      current += ms;
      return current;
    },
  };
}
