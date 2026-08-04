/**
 * Path service.
 *
 * Answers two questions in one call:
 *   - what are the shortest routes between these two devices?
 *   - is there a route that survives losing any single hop on the shortest one?
 *
 * The second question is what an operator actually wants. A pair connected by
 * four different paths that all cross the same aggregation router is not
 * redundant, and only a node-disjoint search reveals that.
 */
import { readQuery } from '../db/session.js';
import { buildPathRequest, mapPaths } from '../queries/pathFinder.js';

export async function findPaths(query) {
  const { depth, shortestCypher, alternateCypher, params } = buildPathRequest(query);
  const startedAt = Date.now();

  const paths = mapPaths(await readQuery(shortestCypher, params));

  if (paths.length === 0) {
    return {
      from: params.fromId,
      to: params.toId,
      maxHops: depth,
      paths: [],
      redundancy: {
        status: 'unreachable',
        summary: `No route of ${depth} hops or fewer connects these devices.`,
        alternate: null,
        sharedHops: [],
      },
      tookMs: Date.now() - startedAt,
    };
  }

  // Endpoints are excluded — a "disjoint" path is not required to avoid the
  // two devices we are trying to connect.
  const primary = paths[0];
  const intermediateIds = primary.hops.slice(1, -1).map((hop) => hop.id);

  // Adjacent devices have no intermediate hops, so there is nothing to route
  // around and the direct link is the whole story.
  if (intermediateIds.length === 0) {
    return {
      from: params.fromId,
      to: params.toId,
      maxHops: depth,
      paths,
      redundancy: {
        status: 'direct',
        summary: 'These devices are directly connected — there is no intermediate hop to lose.',
        alternate: null,
        sharedHops: [],
      },
      tookMs: Date.now() - startedAt,
    };
  }

  const alternate = (await runAlternate(alternateCypher, params, intermediateIds))[0] ?? null;

  if (alternate) {
    return {
      from: params.fromId,
      to: params.toId,
      maxHops: depth,
      paths,
      redundancy: {
        status: 'protected',
        summary:
          `A ${alternate.hopCount}-hop route exists that shares no intermediate hop with the ` +
          'primary path, so losing any single device on the primary route does not cut this pair off.',
        alternate,
        criticalHops: [],
      },
      tookMs: Date.now() - startedAt,
    };
  }

  // No fully node-disjoint route exists. That is *not* the same as "any of
  // these hops is fatal": every route could cross at least one hop from the
  // set while no individual hop is unavoidable on its own.
  //
  // So each intermediate hop is tested by itself. A hop that no route can
  // avoid is a genuine cut vertex for this pair; the rest are not, and saying
  // otherwise would be a false alarm an operator would act on.
  const criticalHops = [];
  for (const hop of primary.hops.slice(1, -1)) {
    const detour = await runAlternate(alternateCypher, params, [hop.id]);
    if (detour.length === 0) criticalHops.push(hop);
  }

  return {
    from: params.fromId,
    to: params.toId,
    maxHops: depth,
    paths,
    redundancy: criticalHops.length > 0
      ? {
          status: 'at-risk',
          summary:
            `Within ${depth} hops, no route avoids ${listNames(criticalHops)}. ` +
            `Losing ${criticalHops.length === 1 ? 'that device' : 'any one of those devices'} ` +
            'cuts this pair off.',
          alternate: null,
          criticalHops,
        }
      : {
          status: 'partial',
          summary:
            'No single route-around exists that avoids every hop on the primary path at once, ' +
            'but no individual hop is unavoidable either — each one can be routed around ' +
            'separately. This pair survives any single device failure.',
          alternate: null,
          criticalHops: [],
        },
    tookMs: Date.now() - startedAt,
  };
}

/** Shortest route avoiding a given set of devices; empty when none exists. */
async function runAlternate(cypher, params, excludeIds) {
  return mapPaths(
    await readQuery(cypher, { fromId: params.fromId, toId: params.toId, excludeIds }),
  );
}

function listNames(hops) {
  const names = hops.map((hop) => hop.name);
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}`;
}
