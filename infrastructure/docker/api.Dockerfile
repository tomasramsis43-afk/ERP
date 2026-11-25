# Build from the repository root:  docker build -f infrastructure/docker/api.Dockerfile -t erp-api .
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/accounting-engine/package.json packages/accounting-engine/
COPY packages/shared-types/package.json packages/shared-types/
# Install only what the API needs (its workspace dependencies are linked automatically).
RUN npm ci --workspace @erp/api --include-workspace-root --ignore-scripts
COPY packages packages
COPY apps/api apps/api
RUN npm run build --workspace @erp/shared-types --workspace @erp/accounting-engine \
 && cd apps/api && npx prisma generate && npm run build

FROM node:22-alpine AS run
RUN apk add --no-cache openssl tini
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# Apply migrations, make sure reference data exists (idempotent), then serve.
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node prisma/seed.ts && node dist/main.js"]
