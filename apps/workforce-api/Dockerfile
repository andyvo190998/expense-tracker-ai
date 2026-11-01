FROM node:22-alpine AS build

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/workforce-api/package.json apps/workforce-api/package.json
RUN pnpm install --frozen-lockfile --filter @expense-tracker/workforce-api...
COPY apps/workforce-api ./apps/workforce-api
RUN pnpm --filter @expense-tracker/workforce-api prisma:generate \
    && pnpm --filter @expense-tracker/workforce-api build

FROM node:22-alpine AS runner

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
ENV NODE_ENV=production
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/workforce-api/node_modules ./apps/workforce-api/node_modules
COPY --from=build /repo/apps/workforce-api/package.json ./apps/workforce-api/package.json
COPY --from=build /repo/apps/workforce-api/dist ./apps/workforce-api/dist
COPY --from=build /repo/apps/workforce-api/prisma ./apps/workforce-api/prisma
WORKDIR /repo/apps/workforce-api
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && node dist/src/main.js"]
