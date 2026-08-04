# ---------------------------------------------------------------------------
# Single-service image: Express serves both the API and the built React bundle.
#
# One process, one port, one thing to deploy. There is no separate static host
# and no CORS in production because the UI and the API share an origin.
# ---------------------------------------------------------------------------

# --- Stage 1: build the frontend -------------------------------------------
FROM node:22-alpine AS client-build

WORKDIR /build

# Dependencies are copied and installed before the source so that editing a
# component does not invalidate the npm install layer.
COPY client/package.json ./client/
RUN npm install --prefix client --no-audit --no-fund

COPY client/ ./client/
RUN npm run build --prefix client


# --- Stage 2: server dependencies ------------------------------------------
FROM node:22-alpine AS server-deps

WORKDIR /build
COPY server/package.json ./server/
# `--omit=dev` because the server has no build step and no dev-only runtime
# requirements; this keeps the final image to the driver and Express.
RUN npm install --prefix server --omit=dev --no-audit --no-fund


# --- Stage 3: runtime ------------------------------------------------------
FROM node:22-alpine AS runtime

# Run as a non-root user. The base image already provides `node` (uid 1000).
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080

COPY --from=server-deps /build/server/node_modules ./server/node_modules
COPY server/package.json ./server/package.json
COPY server/src ./server/src
COPY server/scripts ./server/scripts
COPY package.json ./package.json

# `server/public` is the first location the app looks for a built frontend,
# so the bundle lands there and no path configuration is needed at runtime.
COPY --from=client-build /build/client/dist ./server/public

USER node

EXPOSE 8080

# Reports unhealthy only if the process stops answering. A database outage
# deliberately does not fail this check — the app still serves, and returns a
# 503 with an explanation, which is more useful than a restart loop.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health?deep=false').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/src/index.js"]
