/**
 * Catalogue service: lookup data for pickers and the dashboard header.
 */
import { readQuery } from '../db/session.js';
import {
  devicesCypher,
  buildDeviceParams,
  mapDevices,
  statsCypher,
  mapStats,
  sitesCypher,
  mapSites,
} from '../queries/catalog.js';

export async function listDevices(query) {
  const params = buildDeviceParams(query);
  const records = await readQuery(devicesCypher, params);
  return { devices: mapDevices(records), filters: params };
}

export async function getStats() {
  const records = await readQuery(statsCypher, {});
  const stats = mapStats(records);
  // A reachable but empty database is a distinct state from an unreachable
  // one, and the UI tells the user to run the seed script rather than showing
  // a connection error.
  return stats ?? { sites: 0, devices: 0, interfaces: 0, circuits: 0, services: 0, customers: 0, links: 0 };
}

export async function listSites() {
  const records = await readQuery(sitesCypher, {});
  return mapSites(records);
}
