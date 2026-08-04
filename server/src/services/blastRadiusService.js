/**
 * Blast radius service.
 *
 * Composes the two halves of the answer — directly attached customers and
 * customers stranded by loss of reachability — into one payload, plus the
 * subgraph the visualisation draws.
 */
import { readQuery } from '../db/session.js';
import {
  directImpactCypher,
  isolationImpactCypher,
  isolatedCustomersCypher,
  impactSubgraphCypher,
  impactSubgraphLinksCypher,
  mapDirectImpact,
  mapIsolatedDevices,
  mapIsolatedCustomers,
  mapSubgraphNodes,
  mapSubgraphLinks,
  REACHABILITY_DEPTH,
} from '../queries/blastRadius.js';

export class DeviceNotFound extends Error {
  constructor(deviceId) {
    super(`No device with id "${deviceId}".`);
    this.name = 'DeviceNotFound';
    this.status = 404;
    this.code = 'not_found';
  }
}

/** Cap on named customers returned for isolated devices; the counts are exact regardless. */
const MAX_NAMED_CUSTOMERS = 250;

export async function getBlastRadius(deviceId, { includeGraph = true } = {}) {
  const startedAt = Date.now();

  // Both halves are independent reads against the same snapshot-free view, so
  // they are issued together.
  const [directRecords, isolationRecords] = await Promise.all([
    readQuery(directImpactCypher, { deviceId }),
    readQuery(isolationImpactCypher, { deviceId }),
  ]);

  const direct = mapDirectImpact(directRecords);
  if (!direct) throw new DeviceNotFound(deviceId);

  const isolatedDevices = mapIsolatedDevices(isolationRecords);
  const isolatedIds = isolatedDevices.map((device) => device.id);

  const isolatedCustomers = isolatedIds.length > 0
    ? mapIsolatedCustomers(
        await readQuery(isolatedCustomersCypher, {
          deviceIds: isolatedIds,
          limit: MAX_NAMED_CUSTOMERS,
        }),
      )
    : [];

  const graph = includeGraph
    ? await buildImpactGraph([deviceId, ...isolatedIds])
    : { nodes: [], links: [] };

  const isolatedCustomerCount = isolatedDevices.reduce((sum, d) => sum + d.customers, 0);
  const isolatedMrr = isolatedDevices.reduce((sum, d) => sum + d.mrrAtRisk, 0);
  const directMrr = direct.customers.reduce((sum, c) => sum + c.mrr, 0);

  return {
    device: direct.device,
    reachabilityDepth: REACHABILITY_DEPTH,

    direct: {
      services: direct.services,
      customers: direct.customers,
      customerCount: direct.customers.length,
      mrrAtRisk: directMrr,
    },

    isolation: {
      devices: isolatedDevices,
      // Counts come from the aggregating query and are exact; the named list is
      // capped, so the UI must not derive counts from it.
      customerCount: isolatedCustomerCount,
      mrrAtRisk: isolatedMrr,
      customers: isolatedCustomers,
      customersTruncated: isolatedCustomerCount > isolatedCustomers.length,
    },

    totals: {
      impactedDevices: 1 + isolatedDevices.length,
      impactedCustomers: direct.customers.length + isolatedCustomerCount,
      mrrAtRisk: directMrr + isolatedMrr,
    },

    graph,
    tookMs: Date.now() - startedAt,
  };
}

/**
 * Subgraph for the picture: the failed device, everything it isolates, and one
 * hop of context around each so the failure is visible in situ rather than as
 * a floating cluster.
 */
async function buildImpactGraph(seedIds) {
  const nodeRecords = await readQuery(impactSubgraphCypher, { seedIds });
  const nodes = mapSubgraphNodes(nodeRecords);

  const nodeIds = nodes.map((node) => node.id);
  const linkRecords = nodeIds.length > 0
    ? await readQuery(impactSubgraphLinksCypher, { nodeIds })
    : [];

  const impacted = new Set(seedIds);
  return {
    nodes: nodes.map((node) => ({
      ...node,
      impact: node.id === seedIds[0] ? 'failed' : impacted.has(node.id) ? 'isolated' : 'context',
    })),
    links: mapSubgraphLinks(linkRecords),
  };
}
