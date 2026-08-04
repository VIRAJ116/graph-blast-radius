/**
 * Express application wiring.
 *
 * Separated from `index.js` so the app can be constructed without binding a
 * port — useful for tests and for anything that wants to mount it elsewhere.
 *
 * In production this single process serves both the API and the built React
 * bundle. One process means one thing to deploy, one origin, and no CORS in
 * production.
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import { config } from './config/env.js';
import { api } from './routes/api.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

/**
 * Locates the built frontend.
 *
 * `server/public` is where the Docker build copies it; `client/dist` is where
 * a local `npm run build` leaves it. Checking both means the same server code
 * runs in both places.
 */
function findClientBuild() {
  const candidates = [
    path.join(config.repoRoot, 'server', 'public'),
    path.join(config.repoRoot, 'client', 'dist'),
  ];
  return candidates.find((dir) => fs.existsSync(path.join(dir, 'index.html'))) ?? null;
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '256kb' }));
  app.use(requestLogger);

  // The Vite dev server runs on a different origin. In production the bundle is
  // served from this process, so no cross-origin request exists to allow.
  if (!config.server.isProduction) {
    app.use('/api', cors({ origin: config.server.corsOrigins }));
  }

  app.use('/api', api);

  const clientBuild = findClientBuild();
  if (clientBuild) {
    // Hashed asset filenames can be cached hard; index.html must not be, or
    // browsers keep serving a stale shell after a deploy.
    app.use(express.static(clientBuild, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        else res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));

    // Unmatched non-API routes fall through to the SPA shell so client-side
    // navigation survives a page refresh.
    app.get(/^(?!\/api).*/, (req, res) => {
      res.sendFile(path.join(clientBuild, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.status(200).type('text/plain').send(
        'API is running. The frontend has not been built.\n\n' +
          'Development:  npm run dev:client   (Vite on http://localhost:5173)\n' +
          'Production:   npm run build        (then restart this server)\n',
      );
    });
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler(config.server.isProduction));

  return app;
}
