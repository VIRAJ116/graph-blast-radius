/**
 * Minimal in-memory TTL cache.
 *
 * Used for one thing: the SPOF audit, which issues roughly forty reachability
 * queries and takes seconds against a free-tier instance. Recomputing that on
 * every page load would make the screen feel broken.
 *
 * In-process and unbounded-by-design because the cached set is a handful of
 * entries in a single-process deployment. A multi-instance deployment would
 * want Redis; saying so here is cheaper than pretending this scales.
 */
export function createTtlCache({ ttlMs }) {
  const entries = new Map();

  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (Date.now() > entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key, value) {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    },

    /**
     * Returns the cached value or computes it.
     *
     * In-flight computations are shared: a second caller arriving while the
     * first is still running awaits the same promise instead of starting a
     * duplicate audit. Without this, a page refresh during the initial
     * computation doubles the load on a 0.5 vCPU instance.
     */
    async resolve(key, compute) {
      const cached = this.get(key);
      if (cached !== undefined) return { value: cached, cached: true };

      const pending = entries.get(`${key}::pending`);
      if (pending) return { value: await pending.value, cached: false };

      const promise = compute();
      entries.set(`${key}::pending`, { value: promise, expiresAt: Date.now() + ttlMs });
      try {
        const value = await promise;
        this.set(key, value);
        return { value, cached: false };
      } finally {
        entries.delete(`${key}::pending`);
      }
    },

    clear() {
      entries.clear();
    },
  };
}
