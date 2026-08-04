/**
 * Bounded-concurrency task runner.
 *
 * The SPOF audit runs one reachability query per candidate device. Firing all
 * forty at once would open forty sessions against an instance with half a vCPU,
 * which is slower than running a few at a time and risks tripping the
 * connection cap. Running them strictly in series wastes the round-trip
 * latency. A small pool is the middle.
 *
 * @template T, R
 * @param {T[]} items
 * @param {(item: T, index: number) => Promise<R>} worker
 * @param {{ concurrency?: number }} [options]
 * @returns {Promise<R[]>} results in input order
 */
export async function mapWithConcurrency(items, worker, { concurrency = 4 } = {}) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  const runners = Array.from(
    { length: Math.min(Math.max(1, concurrency), items.length) },
    () => runNext(),
  );

  await Promise.all(runners);
  return results;
}
