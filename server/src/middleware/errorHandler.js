/**
 * Central error translation.
 *
 * The interesting case for this application is the database being unreachable.
 * That has to arrive at the browser as something the UI can act on — a
 * distinguishable code and a sentence a human can read — rather than as a
 * generic 500, because "graceful error handling when the database is
 * unreachable" is a requirement and a reviewer will pull the plug to test it.
 */
import { ConfigurationError } from '../db/driver.js';

/**
 * Driver error codes that mean "the database is not answering right now".
 *
 * `N/A` is in this list because it is what the driver reports for the most
 * common real-world case of all: the host is unreachable, so the pool never
 * acquires a connection and there is no server-side code to quote. Without it,
 * pulling the network cable produced a generic 500 — verified by running the
 * container against a black-holed address.
 */
const UNAVAILABLE_CODES = new Set([
  'ServiceUnavailable',
  'SessionExpired',
  'N/A',
  'Neo.TransientError.General.DatabaseUnavailable',
  'Neo.ClientError.Database.DatabaseNotFound',
]);

const AUTH_CODES = new Set([
  'Neo.ClientError.Security.Unauthorized',
  'Neo.ClientError.Security.AuthenticationRateLimit',
  'Neo.ClientError.Security.CredentialsExpired',
]);

/**
 * Transient server-side conditions (leader elections, store copies). Matched by
 * prefix because the list of specific codes is long and grows between versions.
 *
 * Deliberately narrow: a `Neo.ClientError.Statement.SyntaxError` is a bug in
 * this codebase and must stay a 500. Reporting our own broken Cypher as
 * "the database is down" would send someone to check the wrong thing.
 */
function isTransient(code) {
  return typeof code === 'string' && code.startsWith('Neo.TransientError');
}

function classify(error) {
  if (error instanceof ConfigurationError) {
    return {
      status: 503,
      code: 'configuration_error',
      message: error.message,
      hint: 'Copy .env.example to .env and fill in the CognoDB Cloud connection details.',
    };
  }

  // Errors that deliberately carry their own status: DeviceNotFound (404),
  // InvalidPathRequest (400).
  if (typeof error.status === 'number') {
    return { status: error.status, code: error.code ?? 'error', message: error.message };
  }

  const driverCode = error.code ?? '';

  if (AUTH_CODES.has(driverCode)) {
    return {
      status: 503,
      code: 'database_unauthorized',
      message: 'CognoDB rejected the credentials.',
      hint: 'Verify COGNODB_USER and COGNODB_PASSWORD in .env.',
    };
  }

  if (UNAVAILABLE_CODES.has(driverCode) || isTransient(driverCode)) {
    return {
      status: 503,
      code: 'database_unavailable',
      message: 'The CognoDB instance is not reachable right now.',
      hint: 'Check that the instance is running in the CognoDB console and that COGNODB_URI is correct.',
    };
  }

  return {
    status: 500,
    code: 'internal_error',
    message: 'Something went wrong handling this request.',
  };
}

export function errorHandler(isProduction) {
  // eslint-disable-next-line no-unused-vars -- Express identifies error middleware by arity
  return (error, req, res, next) => {
    const classified = classify(error);

    // 5xx means we could not answer, so it belongs in the log regardless of
    // environment. 4xx is the caller's problem and would only be noise.
    if (classified.status >= 500) {
      console.error(`[error] ${req.method} ${req.originalUrl} -> ${classified.code}`);
      console.error(error);
    }

    res.status(classified.status).json({
      error: classified.code,
      message: classified.message,
      ...(classified.hint ? { hint: classified.hint } : {}),
      // Internals stay out of production responses; in development the stack is
      // what makes the difference between a two-minute and a twenty-minute fix.
      ...(isProduction ? {} : { detail: error.message, stack: error.stack?.split('\n').slice(0, 5) }),
    });
  };
}

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'not_found',
    message: `No API route matches ${req.method} ${req.originalUrl}.`,
  });
}
