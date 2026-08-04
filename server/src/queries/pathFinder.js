/**
 * Path finder: how two devices reach each other, and whether they still can
 * when the obvious route is gone.
 *
 * ---------------------------------------------------------------------------
 * A note on parameterisation, because this file looks like an exception
 * ---------------------------------------------------------------------------
 * Every parameter that carries user input — device ids, result limits, excluded
 * nodes — is passed through the driver as a real query parameter.
 *
 * The one thing Cypher will not accept as a parameter is the bound of a
 * variable-length pattern: `-[:LINKED_TO*..$maxHops]-` is a syntax error, not a
 * runtime failure. The usual workaround is to interpolate the number into the
 * query string, which quietly reintroduces string-built Cypher.
 *
 * Instead, the eight legal depths are compiled into a frozen lookup table once
 * at module load. A request selects a table entry by integer; it never
 * contributes text to a query. If the requested depth is not one of the eight,
 * the lookup misses and the request is rejected rather than coerced.
 */
import { clampInt } from './catalog.js';

/** The only depths this API will search. Literals, not input. */
const ALLOWED_DEPTHS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

const HOP_PROJECTION = `
  [n IN nodes(path) | {
     id: n.id, name: n.name, role: n.role, status: n.status
   }] AS hops,
  [r IN relationships(path) | {
     circuitId: r.circuitId, capacityGbps: r.capacityGbps, kind: r.kind
   }] AS segments,
  length(path) AS hopCount
`;

/**
 * All equally-shortest routes between two devices.
 *
 * `allShortestPaths` is the reason this is one line rather than an iterative
 * deepening loop in application code: the engine runs a bidirectional breadth
 * first search and returns every joint-shortest result in one pass.
 */
function buildShortestPathsCypher(depth) {
  return `
    MATCH (a:Device { id: $fromId })
    MATCH (b:Device { id: $toId })
    MATCH path = allShortestPaths((a)-[:LINKED_TO*..${depth}]-(b))
    RETURN ${HOP_PROJECTION}
    LIMIT toInteger($limit)
  `;
}

/**
 * The shortest route that avoids a given set of devices.
 *
 * Used to answer "is this pair actually protected?". Running it with the
 * intermediate hops of the primary route excluded asks for a node-disjoint
 * alternative — if none comes back, every route between these two devices
 * shares a hop, and the pair is one failure away from being cut off.
 *
 * The predicate sits on a `shortestPath` rather than on an unbounded pattern
 * so the search stays a filtered BFS instead of enumerating every route.
 */
function buildAlternatePathCypher(depth) {
  return `
    MATCH (a:Device { id: $fromId })
    MATCH (b:Device { id: $toId })
    MATCH path = shortestPath((a)-[:LINKED_TO*..${depth}]-(b))
    WHERE NONE(n IN nodes(path) WHERE n.id IN $excludeIds)
    RETURN ${HOP_PROJECTION}
  `;
}

/** Depth -> compiled query. Built once, frozen, never rebuilt per request. */
export const SHORTEST_PATHS_BY_DEPTH = Object.freeze(
  Object.fromEntries(ALLOWED_DEPTHS.map((depth) => [depth, buildShortestPathsCypher(depth)])),
);

export const ALTERNATE_PATH_BY_DEPTH = Object.freeze(
  Object.fromEntries(ALLOWED_DEPTHS.map((depth) => [depth, buildAlternatePathCypher(depth)])),
);

export const DEFAULT_MAX_HOPS = 6;

export class InvalidPathRequest extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidPathRequest';
    this.status = 400;
    this.code = 'invalid_request';
  }
}

/**
 * Validates a path request and resolves the depth to a compiled query.
 * Throws InvalidPathRequest rather than silently substituting a default, so a
 * malformed request is visible instead of returning plausible wrong answers.
 */
export function buildPathRequest({ from, to, maxHops, limit } = {}) {
  const fromId = typeof from === 'string' ? from.trim() : '';
  const toId = typeof to === 'string' ? to.trim() : '';

  if (!fromId || !toId) {
    throw new InvalidPathRequest('Both "from" and "to" device ids are required.');
  }
  if (fromId === toId) {
    throw new InvalidPathRequest('"from" and "to" must be different devices.');
  }

  const depth = maxHops === undefined || maxHops === '' ? DEFAULT_MAX_HOPS : Number.parseInt(maxHops, 10);
  if (!ALLOWED_DEPTHS.includes(depth)) {
    throw new InvalidPathRequest(
      `"maxHops" must be one of ${ALLOWED_DEPTHS.join(', ')}. Received: ${maxHops}`,
    );
  }

  return {
    depth,
    shortestCypher: SHORTEST_PATHS_BY_DEPTH[depth],
    alternateCypher: ALTERNATE_PATH_BY_DEPTH[depth],
    params: { fromId, toId, limit: clampInt(limit, 1, 25, 10) },
  };
}

export function mapPaths(records) {
  return records.map((record) => ({
    hopCount: Number(record.get('hopCount')),
    hops: record.get('hops'),
    segments: (record.get('segments') ?? []).map((segment) => ({
      ...segment,
      capacityGbps: Number(segment.capacityGbps),
    })),
  }));
}
