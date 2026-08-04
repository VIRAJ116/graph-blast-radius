/**
 * Single point of failure audit.
 *
 * This screen has no Cypher of its own beyond a candidate list, and that is
 * deliberate. A SPOF is exactly a device whose isolation impact is non-empty,
 * so the audit runs the isolation query from `blastRadius.js` once per
 * candidate and ranks the results. Reusing the query means the number the audit
 * reports and the number the blast-radius screen reports cannot disagree.
 *
 * Only core and distribution routers are audited by default. An access router
 * failing takes out the customers hanging off it, which is true but not
 * interesting — it is the definition of an access router, not a design flaw.
 * The candidates worth ranking are the ones whose failure hurts devices *other
 * than themselves*.
 */

/** Candidates to audit. Roles come from a validated allow-list, never raw input. */
export const spofCandidatesCypher = `
  MATCH (d:Device)-[:LOCATED_IN]->(s:Site)
  WHERE d.role IN $roles
  RETURN d.id AS id, d.name AS name, d.role AS role,
         s.id AS siteId, s.name AS siteName
  ORDER BY d.role, d.name
`;

const AUDITABLE_ROLES = new Set(['core', 'distribution', 'access']);
const DEFAULT_ROLES = Object.freeze(['core', 'distribution']);

export function buildCandidateParams({ roles } = {}) {
  if (!roles) return { roles: [...DEFAULT_ROLES] };

  const requested = (Array.isArray(roles) ? roles : String(roles).split(','))
    .map((role) => role.trim())
    .filter((role) => AUDITABLE_ROLES.has(role));

  return { roles: requested.length > 0 ? requested : [...DEFAULT_ROLES] };
}

export function mapCandidates(records) {
  return records.map((record) => ({
    id: record.get('id'),
    name: record.get('name'),
    role: record.get('role'),
    siteId: record.get('siteId'),
    siteName: record.get('siteName'),
  }));
}
