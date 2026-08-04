/**
 * Single point of failure audit.
 *
 * Runs the isolation-impact query once per candidate device and ranks the
 * results by how much of the customer base each failure would strand.
 *
 * Cost is honest: roughly forty reachability queries, each doing a bounded
 * variable-length expansion with a negative path predicate. Against a free-tier
 * instance that is seconds, not milliseconds. Three things keep it usable:
 *
 *   - candidates default to core and distribution routers only
 *   - queries run through a small concurrency pool rather than all at once
 *   - the ranked result is cached for SPOF_CACHE_TTL_SECONDS
 *
 * Doing this in application code with a graph loaded into memory would be
 * faster. It is done in Cypher because the point of the exercise is that the
 * database can answer this, and because an in-memory copy would be one more
 * thing that can silently disagree with the data.
 */
import { config } from '../config/env.js';
import { readQuery } from '../db/session.js';
import { createTtlCache } from '../lib/cache.js';
import { mapWithConcurrency } from '../lib/pool.js';
import { spofCandidatesCypher, buildCandidateParams, mapCandidates } from '../queries/spof.js';
import { isolationImpactCypher, mapIsolatedDevices } from '../queries/blastRadius.js';

const cache = createTtlCache({ ttlMs: config.cache.spofTtlMs });

/** Concurrent reachability queries. Four keeps a 0.5 vCPU instance busy without swamping it. */
const AUDIT_CONCURRENCY = 4;

export async function getSpofAudit({ roles, limit = 25, refresh = false } = {}) {
  const params = buildCandidateParams({ roles });
  const key = params.roles.join(',');

  if (refresh) cache.clear();

  const { value, cached } = await cache.resolve(key, () => runAudit(params));

  return {
    ...value,
    findings: value.findings.slice(0, Number(limit) || 25),
    totalFindings: value.findings.length,
    cached,
    cacheTtlSeconds: Math.round(config.cache.spofTtlMs / 1000),
  };
}

async function runAudit(params) {
  const startedAt = Date.now();

  const candidates = mapCandidates(await readQuery(spofCandidatesCypher, params));

  const results = await mapWithConcurrency(
    candidates,
    async (candidate) => {
      const isolated = mapIsolatedDevices(
        await readQuery(isolationImpactCypher, { deviceId: candidate.id }),
      );

      return {
        ...candidate,
        isolatedDevices: isolated.length,
        isolatedCustomers: isolated.reduce((sum, device) => sum + device.customers, 0),
        mrrAtRisk: isolated.reduce((sum, device) => sum + device.mrrAtRisk, 0),
        // Named so the UI can explain a finding without a second round trip.
        sample: isolated.slice(0, 5).map((device) => ({
          id: device.id,
          name: device.name,
          siteName: device.siteName,
          customers: device.customers,
        })),
      };
    },
    { concurrency: AUDIT_CONCURRENCY },
  );

  // A candidate that isolates nothing is not a finding — it is a correctly
  // redundant device, and listing it would bury the real ones.
  const findings = results
    .filter((result) => result.isolatedDevices > 0)
    .sort((a, b) =>
      b.isolatedCustomers - a.isolatedCustomers ||
      b.isolatedDevices - a.isolatedDevices ||
      a.name.localeCompare(b.name));

  return {
    roles: params.roles,
    candidatesAudited: candidates.length,
    findings,
    computedAt: new Date().toISOString(),
    tookMs: Date.now() - startedAt,
  };
}
