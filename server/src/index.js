/**
 * Process entry point: boot checks, listen, graceful shutdown.
 *
 * The important decision here is that a database problem does not stop the
 * server from starting. If the instance is asleep, the credentials are wrong,
 * or `.env` was never created, the API comes up and returns a 503 that the UI
 * turns into an explanation. A process that exits on boot gives the user a
 * blank page and a container restart loop instead.
 */
import { config, describeConnection, missingRequired } from './config/env.js';
import { checkConnectivity, closeDriver } from './db/driver.js';
import { createApp } from './app.js';

const app = createApp();

const server = app.listen(config.server.port, () => {
  console.log('');
  console.log('  Network Blast Radius Explorer');
  console.log('  ─────────────────────────────');
  console.log(`  listening   http://localhost:${config.server.port}`);
  console.log(`  environment ${config.server.nodeEnv}`);

  const connection = describeConnection();
  console.log(`  cognodb     ${connection.uri} (user: ${connection.user})`);
  console.log('');

  void reportDatabaseState();
});

async function reportDatabaseState() {
  const missing = missingRequired();
  if (missing.length > 0) {
    console.warn(`  ! Missing environment variables: ${missing.join(', ')}`);
    console.warn('    The API will answer with 503 until .env is filled in.');
    console.warn('    Copy .env.example to .env and add your CognoDB connection details.\n');
    return;
  }

  const health = await checkConnectivity();
  if (health.ok) {
    console.log('  ✓ Connected to CognoDB.\n');
  } else {
    console.warn(`  ! Cannot reach CognoDB: ${health.error}`);
    console.warn('    The API will answer with 503 until the instance is reachable.\n');
  }
}

/**
 * Stop accepting connections, let in-flight requests finish, close the driver
 * pool. The hard exit is a backstop for a request that never completes.
 */
async function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);

  const forceExit = setTimeout(() => {
    console.error('Shutdown timed out after 10s — exiting.');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(async () => {
    await closeDriver();
    clearTimeout(forceExit);
    console.log('Closed cleanly.');
    process.exit(0);
  });
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
