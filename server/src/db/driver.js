/**
 * Neo4j driver lifecycle.
 *
 * CognoDB Cloud speaks Bolt and is driven by the official `neo4j-driver`
 * package with no custom SDK. One driver instance is shared by the whole
 * process; the driver maintains its own connection pool, so creating more than
 * one would waste connections against a free tier capped at 200.
 */
import neo4j from 'neo4j-driver';
import { config, missingRequired } from '../config/env.js';

/** @type {import('neo4j-driver').Driver | null} */
let driver = null;

/**
 * Tracks the last known connectivity state so `/api/health` and the error
 * middleware can report something more useful than "it threw".
 */
const connectivity = {
  ok: false,
  checkedAt: null,
  error: null,
};

export class ConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigurationError';
    this.code = 'configuration_error';
  }
}

/**
 * Lazily creates the shared driver.
 *
 * Throws ConfigurationError when connection details are absent. That is a
 * different failure from "the database is down", and the two are reported
 * differently to the user.
 */
export function getDriver() {
  if (driver) return driver;

  const missing = missingRequired();
  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in your CognoDB Cloud connection details.',
    );
  }

  driver = neo4j.driver(
    config.neo4j.uri,
    neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
    {
      // Free tier is 0.5 vCPU / 256 MB with a 200 connection ceiling. A small
      // pool keeps us well clear of it and surfaces backpressure early.
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 15_000,
      maxTransactionRetryTime: 10_000,
      // Bolt over TLS is handled by the `bolt+s://` scheme in the URI itself,
      // so encryption settings are deliberately not overridden here — doing so
      // conflicts with the scheme and the driver rejects it.
      disableLosslessIntegers: true,
    },
  );

  return driver;
}

/**
 * Verifies the database is reachable and the credentials are accepted.
 * Never throws: the result is recorded and returned so callers can decide.
 */
export async function checkConnectivity() {
  try {
    const instance = getDriver();
    await instance.verifyConnectivity();
    connectivity.ok = true;
    connectivity.error = null;
  } catch (error) {
    connectivity.ok = false;
    connectivity.error = error instanceof Error ? error.message : String(error);
  }
  connectivity.checkedAt = new Date().toISOString();
  return { ...connectivity };
}

export function lastConnectivity() {
  return { ...connectivity };
}

/**
 * Closes the pool. Called on SIGTERM/SIGINT so in-flight queries finish and
 * the platform does not report an unclean shutdown.
 */
export async function closeDriver() {
  if (!driver) return;
  const instance = driver;
  driver = null;
  await instance.close();
}
