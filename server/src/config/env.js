/**
 * Environment configuration.
 *
 * Loads `.env` from the repository root, validates the variables the
 * application cannot run without, and exposes a single frozen config object.
 *
 * Connection details are read from the environment only. Nothing in this
 * repository contains a URI or a password.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');

// `.env` lives at the repository root so a single file serves the server and
// the seed scripts. Values already present in the real environment win, which
// is what platforms like Render and Fly inject at runtime.
dotenv.config({ path: path.join(repoRoot, '.env') });

/** Variables without which we cannot reach the database at all. */
const REQUIRED = ['COGNODB_URI', 'COGNODB_USER', 'COGNODB_PASSWORD'];

function readInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Returns the list of missing required variables. Callers decide whether that
 * is fatal: the seed script exits, the HTTP server starts anyway and serves
 * 503s so the UI can render a useful error state instead of failing to boot.
 */
export function missingRequired() {
  return REQUIRED.filter((key) => !process.env[key]);
}

export const config = Object.freeze({
  repoRoot,

  neo4j: Object.freeze({
    uri: process.env.COGNODB_URI ?? '',
    user: process.env.COGNODB_USER ?? 'cognodb',
    password: process.env.COGNODB_PASSWORD ?? '',
    // CognoDB Cloud serves the default database; leaving this undefined lets
    // the driver pick it rather than guessing a name.
    database: process.env.COGNODB_DATABASE || undefined,
  }),

  server: Object.freeze({
    port: readInt('PORT', 8080),
    nodeEnv: process.env.NODE_ENV ?? 'development',
    isProduction: process.env.NODE_ENV === 'production',
    corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  }),

  cache: Object.freeze({
    spofTtlMs: readInt('SPOF_CACHE_TTL_SECONDS', 300) * 1000,
  }),
});

/**
 * Redacted view of the connection settings, safe to log at boot.
 */
export function describeConnection() {
  const { uri, user, database } = config.neo4j;
  return {
    uri: uri || '(unset)',
    user: user || '(unset)',
    database: database ?? '(default)',
    passwordSet: Boolean(config.neo4j.password),
  };
}
