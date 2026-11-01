FROM node:22-alpine AS dependencies

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN pnpm install --frozen-lockfile --filter @expense-tracker/web...

FROM node:22-alpine AS builder

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY --from=dependencies /repo/node_modules ./node_modules
COPY --from=dependencies /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=dependencies /repo/packages/contracts/node_modules ./packages/contracts/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web ./apps/web
COPY packages/contracts ./packages/contracts
RUN pnpm --filter @expense-tracker/web build

FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/web/.next/static ./apps/web/.next/static

USER nextjs
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
