/**
 * Session helpers.
 *
 * Every application query is a read. Using explicit READ sessions lets the
 * driver route work appropriately and makes the read-only contract of the API
 * visible in the code rather than only in the documentation.
 */
import neo4j from 'neo4j-driver';
import { config } from '../config/env.js';
import { getDriver } from './driver.js';

/**
 * Runs `work` inside a read transaction and always closes the session.
 *
 * `executeRead` retries transient failures (leader switches, brief network
 * blips) using the driver's own backoff, which matters on a shared free tier.
 *
 * @template T
 * @param {(tx: import('neo4j-driver').ManagedTransaction) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withReadSession(work) {
  const session = getDriver().session({
    defaultAccessMode: neo4j.session.READ,
    database: config.neo4j.database,
  });
  try {
    return await session.executeRead(work);
  } finally {
    await session.close();
  }
}

/**
 * Write counterpart, used only by the seed and schema scripts. The HTTP API
 * never calls this.
 *
 * @template T
 * @param {(tx: import('neo4j-driver').ManagedTransaction) => Promise<T>} work
 * @returns {Promise<T>}
 */
export async function withWriteSession(work) {
  const session = getDriver().session({
    defaultAccessMode: neo4j.session.WRITE,
    database: config.neo4j.database,
  });
  try {
    return await session.executeWrite(work);
  } finally {
    await session.close();
  }
}

/**
 * Convenience wrapper: run one parameterised Cypher statement and return the
 * raw records.
 *
 * @param {string} cypher
 * @param {Record<string, unknown>} params
 */
export async function readQuery(cypher, params = {}) {
  return withReadSession(async (tx) => {
    const result = await tx.run(cypher, params);
    return result.records;
  });
}
