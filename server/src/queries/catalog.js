/**
 * Catalogue queries: the lookup data the UI needs to let a user pick something.
 *
 * Every module in `queries/` follows the same shape:
 *   - a `cypher` string (or a frozen map of them)
 *   - a `buildParams` function that validates and coerces caller input
 *   - a `map*` function that turns driver records into plain objects
 *
 * Nothing here imports Express or the driver, so each query can be read,
 * reviewed and tested on its own.
 */

/**
 * Device picker list.
 *
 * `$role` and `$q` are nullable: passing null disables that filter. Writing it
 * this way keeps one query for all four filter combinations instead of
 * assembling WHERE clauses in JavaScript, which is how string-built Cypher
 * usually creeps in.
 */
export const devicesCypher = `
  MATCH (d:Device)-[:LOCATED_IN]->(s:Site)
  WHERE ($role IS NULL OR d.role = $role)
    AND ($q    IS NULL OR toLower(d.name) CONTAINS toLower($q))
  OPTIONAL MATCH (d)-[:HAS_INTERFACE]->(:Interface)-[:TERMINATES]->(:Circuit)
                 -[:CARRIES]->(:Service)-[:SERVES]->(c:Customer)
  WITH d, s, count(DISTINCT c) AS directCustomers
  RETURN d.id     AS id,
         d.name   AS name,
         d.role   AS role,
         d.vendor AS vendor,
         d.model  AS model,
         d.status AS status,
         d.mgmtIp AS mgmtIp,
         s.id     AS siteId,
         s.name   AS siteName,
         s.city   AS city,
         directCustomers
  ORDER BY d.role, d.name
  LIMIT toInteger($limit)
`;
// `toInteger($limit)` rather than a bare `$limit`: the driver is configured
// with disableLosslessIntegers, so an outgoing JavaScript number serialises as
// a float and Cypher rejects `LIMIT 300.0`. Coercing in the query keeps these
// modules free of driver types.

const DEVICE_ROLES = new Set(['core', 'distribution', 'access']);

export function buildDeviceParams({ role, q, limit } = {}) {
  return {
    // Reject unknown roles rather than passing them through to return nothing —
    // a typo in the query string should not look like an empty network.
    role: role && DEVICE_ROLES.has(role) ? role : null,
    q: typeof q === 'string' && q.trim() !== '' ? q.trim() : null,
    limit: clampInt(limit, 1, 500, 300),
  };
}

export function mapDevices(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    role: record.get('role'),
    vendor: record.get('vendor'),
    model: record.get('model'),
    status: record.get('status'),
    mgmtIp: record.get('mgmtIp'),
    siteId: record.get('siteId'),
    siteName: record.get('siteName'),
    city: record.get('city'),
    directCustomers: Number(record.get('directCustomers')),
  }));
}

/**
 * Headline counts for the dashboard.
 *
 * Chained WITH clauses keep this to a single round trip. Each MATCH is a label
 * scan, which the store answers from counts rather than by touching nodes.
 */
export const statsCypher = `
  MATCH (n:Site)      WITH count(n) AS sites
  MATCH (n:Device)    WITH sites, count(n) AS devices
  MATCH (n:Interface) WITH sites, devices, count(n) AS interfaces
  MATCH (n:Circuit)   WITH sites, devices, interfaces, count(n) AS circuits
  MATCH (n:Service)   WITH sites, devices, interfaces, circuits, count(n) AS services
  MATCH (n:Customer)  WITH sites, devices, interfaces, circuits, services, count(n) AS customers
  MATCH ()-[l:LINKED_TO]->()
  RETURN sites, devices, interfaces, circuits, services, customers, count(l) AS links
`;

export function mapStats(records) {
  const record = records[0];
  if (!record) return null;
  const read = (key) => Number(record.get(key));
  return {
    sites: read('sites'),
    devices: read('devices'),
    interfaces: read('interfaces'),
    circuits: read('circuits'),
    services: read('services'),
    customers: read('customers'),
    links: read('links'),
  };
}

/** Site list, used by the topology filter. */
export const sitesCypher = `
  MATCH (s:Site)
  OPTIONAL MATCH (d:Device)-[:LOCATED_IN]->(s)
  WITH s, count(d) AS deviceCount
  RETURN s.id AS id, s.name AS name, s.city AS city, s.region AS region, deviceCount
  ORDER BY s.name
`;

export function mapSites(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    city: record.get('city'),
    region: record.get('region'),
    deviceCount: Number(record.get('deviceCount')),
  }));
}

/** Shared integer coercion used by the parameter builders. */
export function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
