/**
 * Schema setup: uniqueness constraints and lookup indexes.
 *
 * Run before seeding:
 *
 *     npm run schema --prefix server
 *
 * The seed script calls this automatically, so it rarely needs running by hand.
 *
 * Constraints are applied one at a time and failures are reported rather than
 * fatal. Managed graph services differ in which constraint forms they support,
 * and a missing constraint slows the seed down without breaking correctness —
 * every write uses MERGE on a business key.
 */
import { withWriteSession } from '../src/db/session.js';
import { closeDriver, getDriver } from '../src/db/driver.js';

/** One uniqueness constraint per label, all keyed on the business `id`. */
const CONSTRAINTS = [
  ['site_id', 'CREATE CONSTRAINT site_id IF NOT EXISTS FOR (n:Site) REQUIRE n.id IS UNIQUE'],
  ['device_id', 'CREATE CONSTRAINT device_id IF NOT EXISTS FOR (n:Device) REQUIRE n.id IS UNIQUE'],
  ['interface_id', 'CREATE CONSTRAINT interface_id IF NOT EXISTS FOR (n:Interface) REQUIRE n.id IS UNIQUE'],
  ['circuit_id', 'CREATE CONSTRAINT circuit_id IF NOT EXISTS FOR (n:Circuit) REQUIRE n.id IS UNIQUE'],
  ['service_id', 'CREATE CONSTRAINT service_id IF NOT EXISTS FOR (n:Service) REQUIRE n.id IS UNIQUE'],
  ['customer_id', 'CREATE CONSTRAINT customer_id IF NOT EXISTS FOR (n:Customer) REQUIRE n.id IS UNIQUE'],
];

/**
 * Indexes for the filters the application actually issues:
 * role filtering on the device picker, name search, segment breakdown.
 */
const INDEXES = [
  ['device_role', 'CREATE INDEX device_role IF NOT EXISTS FOR (n:Device) ON (n.role)'],
  ['device_name', 'CREATE INDEX device_name IF NOT EXISTS FOR (n:Device) ON (n.name)'],
  ['customer_segment', 'CREATE INDEX customer_segment IF NOT EXISTS FOR (n:Customer) ON (n.segment)'],
  ['service_type', 'CREATE INDEX service_type IF NOT EXISTS FOR (n:Service) ON (n.type)'],
];

export async function applySchema({ log = console.log } = {}) {
  const applied = [];
  const skipped = [];

  for (const [name, cypher] of [...CONSTRAINTS, ...INDEXES]) {
    try {
      await withWriteSession((tx) => tx.run(cypher));
      applied.push(name);
    } catch (error) {
      // Not fatal: MERGE on the business key keeps the data correct regardless.
      skipped.push({ name, reason: error.message });
    }
  }

  log(`  constraints/indexes applied: ${applied.length}`);
  if (skipped.length > 0) {
    log(`  skipped (${skipped.length}) — data stays correct, writes are just slower:`);
    for (const { name, reason } of skipped) log(`    - ${name}: ${reason.split('\n')[0]}`);
  }

  return { applied, skipped };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    getDriver();
    console.log('Applying schema...');
    await applySchema();
    console.log('Done.');
  } catch (error) {
    console.error(`Schema setup failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await closeDriver();
  }
}
