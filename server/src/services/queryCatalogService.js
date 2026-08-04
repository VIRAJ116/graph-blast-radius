/**
 * Showcase query catalogue.
 *
 * Powers the Cypher screen. The query text is imported from the same modules
 * the API executes, not copied — a query shown to the reviewer and a query the
 * application runs can therefore never drift apart.
 *
 * The screen is preset-driven rather than a free-text console. A console
 * against a live demo instance is a write and delete surface, and it would
 * prove nothing about this codebase that these five queries do not.
 */
import {
  devicesCypher,
  statsCypher,
} from '../queries/catalog.js';
import { topologyNodesCypher, topologyLinksCypher } from '../queries/topology.js';
import {
  directImpactCypher,
  isolationImpactCypher,
  REACHABILITY_DEPTH,
} from '../queries/blastRadius.js';
import { SHORTEST_PATHS_BY_DEPTH, ALTERNATE_PATH_BY_DEPTH, DEFAULT_MAX_HOPS } from '../queries/pathFinder.js';
import { spofCandidatesCypher } from '../queries/spof.js';

const QUERIES = [
  {
    id: 'isolation-impact',
    title: 'Isolation impact — who loses the backbone?',
    headline: true,
    hops: `variable, 1–${REACHABILITY_DEPTH}`,
    endpoint: 'GET /api/blast-radius/:deviceId',
    exampleParams: { deviceId: 'core-blr-01' },
    cypher: isolationImpactCypher,
    whyGraph:
      'This is the query the whole application exists for. It asks the database to prove a ' +
      'negative: that no route of any length up to the bound reaches a core router without ' +
      'passing through the failed device. In SQL this is a recursive CTE re-executed once per ' +
      'candidate with a different exclusion predicate, then anti-joined against the unfiltered ' +
      'run. Here it is one NOT EXISTS clause that reads like the question.',
  },
  {
    id: 'direct-impact',
    title: 'Direct impact — services attached to a device',
    hops: '4 (fixed)',
    endpoint: 'GET /api/blast-radius/:deviceId',
    exampleParams: { deviceId: 'acc-mum-01' },
    cypher: directImpactCypher,
    whyGraph:
      'A fixed four-hop traversal across five labels: Device, Interface, Circuit, Service, ' +
      'Customer. A relational schema handles this perfectly well with four joins — it is ' +
      'included because being honest about where the graph does not win makes the case for ' +
      'where it does.',
  },
  {
    id: 'spof-candidates',
    title: 'SPOF audit — rank devices by blast radius',
    hops: `variable, 1–${REACHABILITY_DEPTH}, per candidate`,
    endpoint: 'GET /api/spof',
    exampleParams: { roles: ['core', 'distribution'] },
    cypher: spofCandidatesCypher,
    followUp: isolationImpactCypher,
    whyGraph:
      'The audit selects candidates with the query above, then runs the isolation query once ' +
      'per candidate and ranks the results. Reusing the isolation query rather than writing a ' +
      'second version means the number this screen reports and the number the blast-radius ' +
      'screen reports cannot disagree.',
  },
  {
    id: 'shortest-paths',
    title: 'Path finder — every shortest route between two devices',
    hops: `variable, up to ${DEFAULT_MAX_HOPS}`,
    endpoint: 'GET /api/paths',
    exampleParams: { from: 'acc-cok-01', to: 'core-mum-01', maxHops: DEFAULT_MAX_HOPS },
    cypher: SHORTEST_PATHS_BY_DEPTH[DEFAULT_MAX_HOPS],
    whyGraph:
      'allShortestPaths runs a bidirectional breadth-first search and returns every ' +
      'joint-shortest result in one pass. The equivalent in application code is an iterative ' +
      'deepening loop with a round trip per level.',
  },
  {
    id: 'alternate-path',
    title: 'Redundancy check — a route that avoids the primary hops',
    hops: `variable, up to ${DEFAULT_MAX_HOPS}`,
    endpoint: 'GET /api/paths',
    exampleParams: {
      from: 'acc-cok-01',
      to: 'core-mum-01',
      excludeIds: ['dist-cok-01', 'core-blr-01'],
    },
    cypher: ALTERNATE_PATH_BY_DEPTH[DEFAULT_MAX_HOPS],
    whyGraph:
      'Run with the primary route\'s intermediate hops excluded, this asks for a node-disjoint ' +
      'alternative. If nothing comes back, every route between the pair shares a hop — which is ' +
      'the difference between "there are four paths" and "you are actually protected".',
  },
  {
    id: 'topology',
    title: 'Topology — the device graph behind the picture',
    hops: '1',
    endpoint: 'GET /api/topology',
    exampleParams: { siteId: 'site-mum' },
    cypher: topologyNodesCypher,
    followUp: topologyLinksCypher,
    whyGraph:
      'Nodes and links are fetched separately so a well-connected core router\'s properties ' +
      'travel once instead of once per incident link.',
  },
  {
    id: 'catalog',
    title: 'Device catalogue and counts',
    hops: '4 (optional)',
    endpoint: 'GET /api/catalog/devices',
    exampleParams: { role: 'distribution', q: 'mum', limit: 300 },
    cypher: devicesCypher,
    followUp: statsCypher,
    whyGraph:
      'Included to show the filter pattern: $role and $q are nullable parameters and a null ' +
      'disables that filter, so one query serves every combination. That is what keeps ' +
      'conditional WHERE-clause assembly — the usual route back to string-built Cypher — out ' +
      'of the codebase.',
  },
];

/** Collapses the indentation the template literals carry. */
function tidy(cypher) {
  const lines = cypher.replace(/\t/g, '  ').split('\n');
  const meaningful = lines.filter((line) => line.trim() !== '');
  const indent = Math.min(...meaningful.map((line) => line.match(/^ */)[0].length));
  return lines.map((line) => line.slice(indent)).join('\n').trim();
}

export function listShowcaseQueries() {
  return QUERIES.map((query) => ({
    ...query,
    cypher: tidy(query.cypher),
    followUp: query.followUp ? tidy(query.followUp) : null,
  }));
}
