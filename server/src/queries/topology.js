/**
 * Topology overview: the device-level graph that seeds the visualisation.
 *
 * Nodes and links are fetched with two queries rather than one. A single query
 * returning whole paths would send every device's properties once per incident
 * link, which for a well-connected core router means sending the same node
 * eight times. Two queries keep the payload proportional to the graph rather
 * than to its edges.
 */
import { clampInt } from './catalog.js';

/**
 * Devices in the selected site, plus their direct neighbours in other sites.
 *
 * Including one hop beyond the site boundary matters: without it, every
 * inter-site backbone link would point at a node the client does not have, and
 * the visualisation would either drop those links or render dangling stubs.
 */
export const topologyNodesCypher = `
  MATCH (d:Device)-[:LOCATED_IN]->(s:Site)
  WHERE $siteId IS NULL
     OR s.id = $siteId
     OR EXISTS {
          MATCH (d)-[:LINKED_TO]-(:Device)-[:LOCATED_IN]->(near:Site)
          WHERE near.id = $siteId
        }
  OPTIONAL MATCH (d)-[:HAS_INTERFACE]->(:Interface)-[:TERMINATES]->(:Circuit)
                 -[:CARRIES]->(:Service)-[:SERVES]->(c:Customer)
  WITH d, s, count(DISTINCT c) AS customers
  RETURN d.id     AS id,
         d.name   AS name,
         d.role   AS role,
         d.status AS status,
         d.vendor AS vendor,
         d.model  AS model,
         s.id     AS siteId,
         s.name   AS siteName,
         customers
  ORDER BY d.role, d.name
  LIMIT toInteger($limit)
`;

/**
 * Links with at least one endpoint inside the selected site.
 *
 * LINKED_TO is stored in one direction, so a directed match returns each link
 * exactly once. Traversal queries use the undirected form because a physical
 * link carries traffic both ways; here the direction is only a storage detail.
 */
export const topologyLinksCypher = `
  MATCH (a:Device)-[l:LINKED_TO]->(b:Device)
  WHERE $siteId IS NULL
     OR EXISTS { MATCH (a)-[:LOCATED_IN]->(s:Site) WHERE s.id = $siteId }
     OR EXISTS { MATCH (b)-[:LOCATED_IN]->(s:Site) WHERE s.id = $siteId }
  RETURN a.id            AS source,
         b.id            AS target,
         l.circuitId     AS circuitId,
         l.capacityGbps  AS capacityGbps,
         l.kind          AS kind
  LIMIT toInteger($limit)
`;

export function buildTopologyParams({ siteId, limit } = {}) {
  return {
    siteId: typeof siteId === 'string' && siteId.trim() !== '' ? siteId.trim() : null,
    limit: clampInt(limit, 1, 2000, 1000),
  };
}

export function mapTopologyNodes(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    role: record.get('role'),
    status: record.get('status'),
    vendor: record.get('vendor'),
    model: record.get('model'),
    siteId: record.get('siteId'),
    siteName: record.get('siteName'),
    customers: Number(record.get('customers')),
  }));
}

export function mapTopologyLinks(records) {
  return records.map((record) => ({
    source: record.get('source'),
    target: record.get('target'),
    circuitId: record.get('circuitId'),
    capacityGbps: Number(record.get('capacityGbps')),
    kind: record.get('kind'),
  }));
}

/**
 * Full detail for one device: site, interfaces, circuits, neighbours.
 * Feeds the detail drawer.
 */
export const deviceDetailCypher = `
  MATCH (d:Device { id: $deviceId })-[:LOCATED_IN]->(s:Site)
  OPTIONAL MATCH (d)-[:HAS_INTERFACE]->(i:Interface)-[:TERMINATES]->(ckt:Circuit)
  OPTIONAL MATCH (d)-[l:LINKED_TO]-(peer:Device)
  RETURN d.id      AS id,
         d.name    AS name,
         d.role    AS role,
         d.vendor  AS vendor,
         d.model   AS model,
         d.mgmtIp  AS mgmtIp,
         d.status  AS status,
         s.id      AS siteId,
         s.name    AS siteName,
         s.city    AS city,
         i.id            AS interfaceId,
         i.name          AS interfaceName,
         i.speedGbps     AS interfaceSpeedGbps,
         i.status        AS interfaceStatus,
         ckt.id          AS circuitId,
         ckt.name        AS circuitName,
         ckt.type        AS circuitType,
         peer.id         AS peerId,
         peer.name       AS peerName,
         peer.role       AS peerRole,
         l.capacityGbps  AS peerCapacityGbps,
         l.circuitId     AS peerCircuitId
`;

export function mapDeviceDetail(records) {
  if (records.length === 0) return null;
  const first = records[0];

  const base = {
    id: first.get('id'),
    name: first.get('name'),
    role: first.get('role'),
    vendor: first.get('vendor'),
    model: first.get('model'),
    mgmtIp: first.get('mgmtIp'),
    status: first.get('status'),
    siteId: first.get('siteId'),
    siteName: first.get('siteName'),
    city: first.get('city'),
  };

  // Group flat rows into deduplicated interfaces and neighbours.
  const interfacesMap = new Map();
  const neighboursMap = new Map();

  for (const record of records) {
    const iId = record.get('interfaceId');
    if (iId && !interfacesMap.has(iId)) {
      interfacesMap.set(iId, {
        id: iId,
        name: record.get('interfaceName'),
        speedGbps: Number(record.get('interfaceSpeedGbps')),
        status: record.get('interfaceStatus'),
        circuitId: record.get('circuitId'),
        circuitName: record.get('circuitName'),
        circuitType: record.get('circuitType'),
      });
    }

    const pId = record.get('peerId');
    if (pId && !neighboursMap.has(pId)) {
      neighboursMap.set(pId, {
        id: pId,
        name: record.get('peerName'),
        role: record.get('peerRole'),
        capacityGbps: Number(record.get('peerCapacityGbps')),
        circuitId: record.get('peerCircuitId'),
      });
    }
  }

  return {
    ...base,
    interfaces: [...interfacesMap.values()],
    neighbours: [...neighboursMap.values()],
  };
}
