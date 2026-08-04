// Tiny in-memory stale-while-revalidate cache. Pages seed their initial state
// from here so switching bottom tabs shows the last data instantly (no full
// spinner), then refresh in the background. Cleared on logout via clearCache().
const mem = new Map();

export const cacheGet = (key) => mem.get(key);
export const cacheHas = (key) => mem.has(key);
export const cacheSet = (key, data) => { mem.set(key, data); };
export const clearCache = () => mem.clear();

// Convenience: fetch through the cache. Returns the cached value immediately (if
// any) via onData, then revalidates and calls onData again with fresh data.
export async function swr(key, fetcher, onData) {
  if (mem.has(key)) onData(mem.get(key), true);
  try {
    const data = await fetcher();
    mem.set(key, data);
    onData(data, false);
    return data;
  } catch (e) {
    if (!mem.has(key)) throw e;
    return mem.get(key);
  }
}
