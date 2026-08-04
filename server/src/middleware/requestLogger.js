/**
 * One line per API request: method, path, status, duration.
 *
 * Deliberately not a logging library. The useful signal while demonstrating
 * this application is which traversal is slow, and a timing column delivers
 * that without a dependency.
 */
export function requestLogger(req, res, next) {
  if (!req.path.startsWith('/api')) return next();

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const marker = res.statusCode >= 500 ? '!' : res.statusCode >= 400 ? '?' : ' ';
    console.log(
      `${marker} ${req.method.padEnd(4)} ${req.originalUrl.padEnd(48)} ${res.statusCode} ${ms.toFixed(0)}ms`,
    );
  });

  next();
}
