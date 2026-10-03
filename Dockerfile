# Landgrab match server. Build:  docker build -t arcadium-server .
# Run:    docker run -d --restart unless-stopped -p 8787:8787 -e REGION=us arcadium-server

# --- Build: bundle server/index.ts and everything it imports into one file ---
FROM node:22-alpine AS build
WORKDIR /app
# Dependencies first, so code changes don't invalidate the npm ci layer.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY server ./server
COPY src ./src
RUN npm run build:server

# --- Runtime: just Node and the bundle (ws and the game code are inside it) ---
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8787 \
    REGION=local
WORKDIR /app
COPY --from=build /app/dist-server ./dist-server
USER node
EXPOSE 8787
# 127.0.0.1 rather than localhost: on Alpine localhost can resolve to IPv6 first.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/healthz" || exit 1
CMD ["node", "dist-server/index.mjs"]
