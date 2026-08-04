/**
 * Topology service: assembles the { nodes, links } payload the graph view
 * renders, and the detail record the drawer shows.
 */
import { readQuery } from '../db/session.js';
import {
  topologyNodesCypher,
  topologyLinksCypher,
  buildTopologyParams,
  mapTopologyNodes,
  mapTopologyLinks,
  deviceDetailCypher,
  mapDeviceDetail,
} from '../queries/topology.js';

export async function getTopology(query) {
  const params = buildTopologyParams(query);

  // Independent reads, so they go out together rather than one after the
  // other. Two sessions is well within the pool.
  const [nodeRecords, linkRecords] = await Promise.all([
    readQuery(topologyNodesCypher, params),
    readQuery(topologyLinksCypher, params),
  ]);

  const nodes = mapTopologyNodes(nodeRecords);
  const known = new Set(nodes.map((node) => node.id));

  // The node query is LIMITed, so a link can survive whose endpoint was cut.
  // Dropping those here keeps the client from having to defend against edges
  // pointing at nodes it was never given.
  const links = mapTopologyLinks(linkRecords).filter(
    (link) => known.has(link.source) && known.has(link.target),
  );

  return {
    nodes,
    links,
    truncated: nodeRecords.length >= params.limit,
    filters: params,
  };
}

export async function getDeviceDetail(deviceId) {
  const records = await readQuery(deviceDetailCypher, { deviceId });
  return mapDeviceDetail(records);
}
