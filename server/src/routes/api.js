/**
 * HTTP layer.
 *
 * Deliberately thin: parse the request, call a service, send the result. There
 * is no Cypher in this file and no business logic — if a handler grows past a
 * few lines, the logic belongs in a service.
 */
import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { checkConnectivity, lastConnectivity } from '../db/driver.js';
import { listDevices, getStats, listSites } from '../services/catalogService.js';
import { getTopology, getDeviceDetail } from '../services/topologyService.js';
import { getBlastRadius, DeviceNotFound } from '../services/blastRadiusService.js';
import { findPaths } from '../services/pathService.js';
import { getSpofAudit } from '../services/spofService.js';
import { listShowcaseQueries } from '../services/queryCatalogService.js';

export const api = Router();

/**
 * Liveness plus database reachability.
 *
 * Returns 200 with `database.ok: false` rather than 503 when the database is
 * down: the process is healthy and serving, and a platform health check should
 * not restart it because a managed database is briefly unavailable. The UI
 * reads the flag.
 */
api.get('/health', asyncHandler(async (req, res) => {
  const database = req.query.deep === 'false' ? lastConnectivity() : await checkConnectivity();
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    database,
  });
}));

// -- Catalogue --------------------------------------------------------------

api.get('/catalog/devices', asyncHandler(async (req, res) => {
  res.json(await listDevices(req.query));
}));

api.get('/catalog/stats', asyncHandler(async (req, res) => {
  res.json(await getStats());
}));

api.get('/catalog/sites', asyncHandler(async (req, res) => {
  res.json({ sites: await listSites() });
}));

// -- Topology ---------------------------------------------------------------

api.get('/topology', asyncHandler(async (req, res) => {
  res.json(await getTopology(req.query));
}));

api.get('/devices/:deviceId', asyncHandler(async (req, res) => {
  const device = await getDeviceDetail(req.params.deviceId);
  if (!device) throw new DeviceNotFound(req.params.deviceId);
  res.json(device);
}));

// -- Blast radius -----------------------------------------------------------

api.get('/blast-radius/:deviceId', asyncHandler(async (req, res) => {
  res.json(await getBlastRadius(req.params.deviceId, {
    includeGraph: req.query.graph !== 'false',
  }));
}));

// -- Single points of failure -----------------------------------------------

api.get('/spof', asyncHandler(async (req, res) => {
  res.json(await getSpofAudit({
    roles: req.query.roles,
    limit: req.query.limit,
    refresh: req.query.refresh === 'true',
  }));
}));

// -- Path finder ------------------------------------------------------------

api.get('/paths', asyncHandler(async (req, res) => {
  res.json(await findPaths(req.query));
}));

// -- Showcase query catalogue ----------------------------------------------

api.get('/queries', (req, res) => {
  res.json({ queries: listShowcaseQueries() });
});
