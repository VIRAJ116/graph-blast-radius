/**
 * Seed script.
 *
 *     npm run seed          # idempotent: MERGE on business keys
 *     npm run seed:reset    # wipe the graph first
 *
 * Reads connection details from `.env` at the repository root. Nothing here
 * contains credentials.
 *
 * Every write is a parameterised `UNWIND $rows AS row` batch. That keeps the
 * number of round trips proportional to batches rather than rows, which matters
 * against a free-tier instance where each round trip crosses the internet.
 */
import { generateTopology } from './generate.js';
import { applySchema } from './schema.js';
import { withWriteSession } from '../src/db/session.js';
import { closeDriver, getDriver, checkConnectivity } from '../src/db/driver.js';
import { describeConnection } from '../src/config/env.js';

/** Rows per write transaction. Small enough for 256 MB, large enough to be quick. */
const BATCH_SIZE = 400;

// ---------------------------------------------------------------------------
// Write steps
// ---------------------------------------------------------------------------
// Order matters: a step may only MATCH nodes created by an earlier step.

const STEPS = [
  {
    name: 'sites',
    rows: (data) => data.sites,
    cypher: `
      UNWIND $rows AS row
      MERGE (s:Site { id: row.id })
      SET s.name = row.name,
          s.city = row.city,
          s.region = row.region,
          s.code = row.code
    `,
  },
  {
    name: 'devices + LOCATED_IN',
    rows: (data) => data.devices,
    cypher: `
      UNWIND $rows AS row
      MERGE (d:Device { id: row.id })
      SET d.name   = row.name,
          d.role   = row.role,
          d.vendor = row.vendor,
          d.model  = row.model,
          d.mgmtIp = row.mgmtIp,
          d.status = row.status
      WITH d, row
      MATCH (s:Site { id: row.siteId })
      MERGE (d)-[:LOCATED_IN]->(s)
    `,
  },
  {
    name: 'circuits',
    rows: (data) => data.circuits,
    cypher: `
      UNWIND $rows AS row
      MERGE (c:Circuit { id: row.id })
      SET c.name         = row.name,
          c.type         = row.type,
          c.capacityGbps = toInteger(row.capacityGbps),
          c.status       = row.status
    `,
  },
  {
    name: 'interfaces + HAS_INTERFACE + TERMINATES',
    rows: (data) => data.interfaces,
    cypher: `
      UNWIND $rows AS row
      MERGE (i:Interface { id: row.id })
      SET i.name      = row.name,
          i.speedGbps = toInteger(row.speedGbps),
          i.status    = row.status
      WITH i, row
      MATCH (d:Device { id: row.deviceId })
      MERGE (d)-[:HAS_INTERFACE]->(i)
      WITH i, row
      MATCH (c:Circuit { id: row.circuitId })
      MERGE (i)-[:TERMINATES]->(c)
    `,
  },
  {
    name: 'services + CARRIES',
    rows: (data) => data.services,
    cypher: `
      UNWIND $rows AS row
      MERGE (s:Service { id: row.id })
      SET s.name    = row.name,
          s.type    = row.type,
          s.slaTier = row.slaTier,
          s.status  = row.status
      WITH s, row
      MATCH (c:Circuit { id: row.circuitId })
      MERGE (c)-[:CARRIES]->(s)
    `,
  },
  {
    name: 'customers + SERVES',
    rows: (data) => data.customers,
    cypher: `
      UNWIND $rows AS row
      MERGE (cu:Customer { id: row.id })
      SET cu.name    = row.name,
          cu.segment = row.segment,
          cu.mrr     = toInteger(row.mrr)
      WITH cu, row
      MATCH (s:Service { id: row.serviceId })
      MERGE (s)-[:SERVES]->(cu)
    `,
  },
  {
    // The denormalised device adjacency every traversal query walks.
    // Derived here, in one pass, from the same link list that produced the
    // interfaces and circuits above — so the two representations cannot drift.
    name: 'LINKED_TO adjacency',
    rows: (data) => data.links,
    cypher: `
      UNWIND $rows AS row
      MATCH (a:Device { id: row.aDeviceId })
      MATCH (b:Device { id: row.bDeviceId })
      MERGE (a)-[l:LINKED_TO { circuitId: row.circuitId }]->(b)
      SET l.capacityGbps = toInteger(row.capacityGbps),
          l.kind         = row.kind
    `,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Deletes everything in batches.
 *
 * A single `MATCH (n) DETACH DELETE n` builds one huge transaction and will
 * exhaust 256 MB of heap, so this loops over bounded slices instead.
 */
async function wipe(log) {
  let removed = 0;
  for (;;) {
    const deleted = await withWriteSession(async (tx) => {
      const result = await tx.run(`
        MATCH (n)
        WITH n LIMIT 1000
        DETACH DELETE n
        RETURN count(n) AS deleted
      `);
      return result.records[0]?.get('deleted') ?? 0;
    });
    const count = Number(deleted);
    removed += count;
    if (count === 0) break;
    log(`  deleted ${removed} nodes...`);
  }
  return removed;
}

async function verify(log) {
  const rows = await withWriteSession(async (tx) => {
    const nodes = await tx.run(`
      MATCH (n)
      WITH labels(n)[0] AS label, count(*) AS cnt
      RETURN label, cnt ORDER BY label
    `);
    const rels = await tx.run(`
      MATCH ()-[r]->()
      WITH type(r) AS rel, count(*) AS cnt
      RETURN rel, cnt ORDER BY rel
    `);
    return {
      nodes: nodes.records.map((r) => [r.get('label'), Number(r.get('cnt'))]),
      rels: rels.records.map((r) => [r.get('rel'), Number(r.get('cnt'))]),
    };
  });

  log('\nGraph contents:');
  log('  nodes:');
  for (const [label, count] of rows.nodes) log(`    ${label.padEnd(12)} ${count}`);
  log('  relationships:');
  for (const [type, count] of rows.rels) log(`    ${type.padEnd(16)} ${count}`);
  return rows;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const log = console.log;
  const shouldReset = process.argv.includes('--reset');

  log('CognoDB seed');
  log('------------');
  const connection = describeConnection();
  log(`  uri:      ${connection.uri}`);
  log(`  user:     ${connection.user}`);
  log(`  database: ${connection.database}`);
  log(`  password: ${connection.passwordSet ? 'set' : 'MISSING'}\n`);

  // getDriver() throws ConfigurationError with an actionable message when the
  // environment is incomplete, which is the common first-run mistake.
  getDriver();

  const health = await checkConnectivity();
  if (!health.ok) {
    throw new Error(
      `Cannot reach CognoDB: ${health.error}\n` +
        'Check COGNODB_URI / COGNODB_PASSWORD in .env and that the instance is running.',
    );
  }
  log('Connected.\n');

  log('Applying schema...');
  await applySchema({ log });

  if (shouldReset) {
    log('\nResetting graph (--reset)...');
    const removed = await wipe(log);
    log(`  removed ${removed} nodes.`);
  }

  const data = generateTopology();
  log(`\nGenerated dataset (seed ${data.meta.seed}):`);
  for (const [key, value] of Object.entries(data.meta.counts)) {
    log(`  ${key.padEnd(12)} ${value}`);
  }

  log('\nWriting...');
  const startedAt = Date.now();

  for (const step of STEPS) {
    const rows = step.rows(data);
    const batches = chunk(rows, BATCH_SIZE);
    for (let i = 0; i < batches.length; i += 1) {
      await withWriteSession((tx) => tx.run(step.cypher, { rows: batches[i] }));
      process.stdout.write(`\r  ${step.name.padEnd(38)} ${i + 1}/${batches.length} batches`);
    }
    process.stdout.write(`\r  ${step.name.padEnd(38)} done (${rows.length} rows)      \n`);
  }

  log(`\nWrote everything in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
  await verify(log);
  log('\nSeed complete. Start the API with: npm start --prefix server');
}

try {
  await main();
} catch (error) {
  console.error(`\nSeed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await closeDriver();
}
