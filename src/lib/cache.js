// Tiny in-memory TTL cache with request coalescing (one in-flight fetch per key).
export function createCache() {
  const store = new Map();

  return {
    async get(key, ttlMs, loader) {
      const hit = store.get(key);
      if (hit && hit.expires > Date.now()) return hit.value;
      const value = loader().catch((e) => {
        store.delete(key);
        throw e;
      });
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    clear() {
      store.clear();
    },
  };
}
