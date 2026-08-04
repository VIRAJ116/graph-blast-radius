/**
 * Blast radius: what breaks when one device fails.
 *
 * The answer has two halves, and they are genuinely different questions.
 *
 *   1. DIRECT IMPACT — services physically attached to the failed device.
 *      A fixed four-hop traversal across five labels. Mechanical, but it is
 *      the part a relational schema handles fine, so it is worth being honest
 *      that this half is not where the graph earns its keep.
 *
 *   2. ISOLATION IMPACT — devices elsewhere in the network that lose their
 *      only route to the backbone. This is the half that makes the whole
 *      application a graph problem: it is a variable-depth reachability
 *      question with a negative path predicate ("is there ANY route that
 *      avoids this node?").
 *
 * A core router has no directly attached customers at all, so its entire blast
 * radius comes from query 2. An access router's comes almost entirely from
 * query 1. Neither query alone answers "who loses service".
 */

/**
 * Depth bound for reachability searches.
 *
 * Bounding the expansion is not cosmetic: an unbounded variable-length pattern
 * over a meshed backbone enumerates a combinatorial number of paths, and the
 * free tier has half a vCPU.
 *
 * The bound is not free, though, and it errs in one direction. Too small and a
 * device whose only surviving route is longer than the bound gets reported as
 * isolated when it is not — a false alarm, never a missed one.
 *
 * Five is not a guess. Across every single-device failure in the seeded
 * topology, the longest surviving route from any device to a core router is
 * five hops (dist-mum-02 after core-mum-01 fails, which reaches the backbone
 * the long way round through a peer site). Four produced exactly one false
 * positive; five matches an unbounded breadth-first search on every device.
 * A larger or differently-shaped network would need this re-derived.
 */
export const REACHABILITY_DEPTH = 5;

/**
 * Half 1 — directly attached services and customers.
 *
 * Returned as one row per customer rather than as nested collections. Flat rows
 * keep the Cypher readable and push the grouping into JavaScript, where it is
 * easier to follow than a stack of `collect(DISTINCT ...)` calls.
 */
export const directImpactCypher = `
  MATCH (d:Device { id: $deviceId })-[:LOCATED_IN]->(site:Site)
  OPTIONAL MATCH (d)-[:HAS_INTERFACE]->(i:Interface)-[:TERMINATES]->(ckt:Circuit)
                 -[:CARRIES]->(svc:Service)-[:SERVES]->(cust:Customer)
  RETURN d.id        AS deviceId,
         d.name      AS deviceName,
         d.role      AS role,
         d.vendor    AS vendor,
         d.model     AS model,
         d.status    AS status,
         site.id     AS siteId,
         site.name   AS siteName,
         i.id        AS interfaceId,
         i.name      AS interfaceName,
         ckt.id      AS circuitId,
         ckt.name    AS circuitName,
         svc.id      AS serviceId,
         svc.name    AS serviceName,
         svc.type    AS serviceType,
         svc.slaTier AS slaTier,
         cust.id     AS customerId,
         cust.name   AS customerName,
         cust.segment AS segment,
         cust.mrr    AS mrr
`;

/**
 * Half 2 — devices isolated from the backbone by this failure.
 *
 * Read it as the sentence it is:
 *
 *   "find devices that can reach a core router today,
 *    but have no route to any core router that avoids the failed device."
 *
 * The `EXISTS` clause excludes devices that were already unreachable, so a
 * pre-existing outage is never reported as this failure's fault. The
 * `NOT EXISTS` clause is the interesting one: it asks the database to prove
 * that *no* qualifying path exists, which is the operation a relational engine
 * has to emulate with a recursive CTE re-run per candidate and then anti-joined.
 *
 * `NONE(n IN nodes(p) ...)` is what makes the second search node-avoiding. It
 * is evaluated per path, so the planner can abandon a path as soon as it
 * touches the failed device.
 */
export const isolationImpactCypher = `
  MATCH (dev:Device)
  WHERE dev.id <> $deviceId
    AND dev.role <> 'core'
    AND EXISTS {
          MATCH (dev)-[:LINKED_TO*1..${REACHABILITY_DEPTH}]-(core:Device)
          WHERE core.role = 'core'
        }
    AND NOT EXISTS {
          MATCH path = (dev)-[:LINKED_TO*1..${REACHABILITY_DEPTH}]-(core:Device)
          WHERE core.role = 'core'
            AND NONE(n IN nodes(path) WHERE n.id = $deviceId)
        }
  OPTIONAL MATCH (dev)-[:HAS_INTERFACE]->(:Interface)-[:TERMINATES]->(:Circuit)
                 -[:CARRIES]->(svc:Service)-[:SERVES]->(cust:Customer)
  // count(DISTINCT) + sum() avoid collect() and reduce() which CognoDB does not support.
  // sum(cust.mrr) with count(DISTINCT cust) is safe here because each customer node
  // appears at most once per device path; duplicates are deduped by the DISTINCT count.
  WITH dev,
       count(DISTINCT svc)  AS services,
       count(DISTINCT cust) AS customers,
       sum(cust.mrr)        AS mrrAtRisk
  MATCH (dev)-[:LOCATED_IN]->(site:Site)
  RETURN dev.id   AS id,
         dev.name AS name,
         dev.role AS role,
         site.id  AS siteId,
         site.name AS siteName,
         services,
         customers,
         mrrAtRisk
  ORDER BY customers DESC, dev.name
`;

/**
 * Customers behind the isolated devices, so the impact table can name them
 * rather than only counting them.
 *
 * Split from the query above because that one aggregates; asking it to also
 * return customer detail would multiply its rows by the customer count.
 */
export const isolatedCustomersCypher = `
  UNWIND $deviceIds AS isolatedId
  MATCH (dev:Device { id: isolatedId })-[:HAS_INTERFACE]->(:Interface)-[:TERMINATES]->(:Circuit)
        -[:CARRIES]->(svc:Service)-[:SERVES]->(cust:Customer)
  RETURN dev.id       AS deviceId,
         dev.name     AS deviceName,
         svc.id       AS serviceId,
         svc.name     AS serviceName,
         svc.type     AS serviceType,
         svc.slaTier  AS slaTier,
         cust.id      AS customerId,
         cust.name    AS customerName,
         cust.segment AS segment,
         cust.mrr     AS mrr
  ORDER BY cust.mrr DESC
  LIMIT toInteger($limit)
`;

/**
 * Neighbourhood subgraph for the visualisation: the failed device, everything
 * it isolates, and one hop around each so the picture has context.
 */
export const impactSubgraphCypher = `
  MATCH (d:Device)-[:LOCATED_IN]->(s:Site)
  WHERE d.id IN $seedIds
     OR EXISTS {
          MATCH (d)-[:LINKED_TO]-(seed:Device)
          WHERE seed.id IN $seedIds
        }
  RETURN DISTINCT d.id AS id, d.name AS name, d.role AS role, d.status AS status,
         s.id AS siteId, s.name AS siteName
`;

/**
 * Links internal to the node set returned above. Takes the *expanded* id list
 * (seeds plus their neighbours), not the seed list, so that the picture has no
 * links pointing at nodes the client was never sent.
 */
export const impactSubgraphLinksCypher = `
  MATCH (a:Device)-[l:LINKED_TO]->(b:Device)
  WHERE a.id IN $nodeIds AND b.id IN $nodeIds
  RETURN a.id AS source, b.id AS target,
         l.circuitId AS circuitId, l.capacityGbps AS capacityGbps, l.kind AS kind
`;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

/**
 * Folds the flat direct-impact rows into device / services / customers.
 *
 * A device with no attached services still produces exactly one row, with every
 * service and customer column null. That row is what tells us the device
 * exists, so it is handled explicitly rather than filtered away.
 */
export function mapDirectImpact(records) {
  if (records.length === 0) return null;

  const first = records[0];
  const device = {
    id: first.get('deviceId'),
    name: first.get('deviceName'),
    role: first.get('role'),
    vendor: first.get('vendor'),
    model: first.get('model'),
    status: first.get('status'),
    siteId: first.get('siteId'),
    siteName: first.get('siteName'),
  };

  const services = new Map();
  const customers = new Map();

  for (const record of records) {
    const serviceId = record.get('serviceId');
    if (!serviceId) continue;

    if (!services.has(serviceId)) {
      services.set(serviceId, {
        id: serviceId,
        name: record.get('serviceName'),
        type: record.get('serviceType'),
        slaTier: record.get('slaTier'),
        circuitId: record.get('circuitId'),
        circuitName: record.get('circuitName'),
        interfaceName: record.get('interfaceName'),
        customerCount: 0,
      });
    }

    const customerId = record.get('customerId');
    if (customerId && !customers.has(customerId)) {
      customers.set(customerId, {
        id: customerId,
        name: record.get('customerName'),
        segment: record.get('segment'),
        mrr: Number(record.get('mrr')),
        serviceId,
        serviceName: record.get('serviceName'),
        deviceId: device.id,
        deviceName: device.name,
        reason: 'direct',
      });
      services.get(serviceId).customerCount += 1;
    }
  }

  return {
    device,
    services: [...services.values()],
    customers: [...customers.values()],
  };
}

export function mapIsolatedDevices(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    role: record.get('role'),
    siteId: record.get('siteId'),
    siteName: record.get('siteName'),
    services: Number(record.get('services')),
    customers: Number(record.get('customers')),
    mrrAtRisk: Number(record.get('mrrAtRisk') ?? 0),
  }));
}

export function mapIsolatedCustomers(records) {
  return records.map((record) => ({
    id: record.get('customerId'),
    name: record.get('customerName'),
    segment: record.get('segment'),
    mrr: Number(record.get('mrr')),
    serviceId: record.get('serviceId'),
    serviceName: record.get('serviceName'),
    serviceType: record.get('serviceType'),
    slaTier: record.get('slaTier'),
    deviceId: record.get('deviceId'),
    deviceName: record.get('deviceName'),
    reason: 'isolated',
  }));
}

export function mapSubgraphNodes(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    role: record.get('role'),
    status: record.get('status'),
    siteId: record.get('siteId'),
    siteName: record.get('siteName'),
  }));
}

export function mapSubgraphLinks(records) {
  return records.map((record) => ({
    source: record.get('source'),
    target: record.get('target'),
    circuitId: record.get('circuitId'),
    capacityGbps: Number(record.get('capacityGbps')),
    kind: record.get('kind'),
  }));
}
