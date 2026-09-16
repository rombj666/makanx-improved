FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci --workspace apps/api --workspace packages/shared --include-workspace-root=false
COPY packages/shared/ packages/shared/
COPY apps/api/src/ apps/api/src/
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
COPY apps/api/tsconfig.json apps/api/tsconfig.json
RUN npm run build:api
RUN npm prune --omit=dev --workspace apps/api --workspace packages/shared --include-workspace-root=false

FROM base AS runtime
ENV NODE_ENV=production PORT=3001
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/shared ./packages/shared
COPY --from=build --chown=node:node /app/apps/api ./apps/api
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/index.js"]
