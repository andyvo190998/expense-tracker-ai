FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/notification-server/package.json apps/notification-server/package.json
RUN pnpm install --frozen-lockfile --filter notification-server...
COPY apps/notification-server ./apps/notification-server
RUN pnpm --filter notification-server build

FROM node:24-slim AS runtime
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/notification-server/node_modules ./apps/notification-server/node_modules
COPY --from=build --chown=node:node /repo/apps/notification-server/package.json ./apps/notification-server/package.json
COPY --from=build --chown=node:node /repo/apps/notification-server/dist ./apps/notification-server/dist
WORKDIR /repo/apps/notification-server
USER node
CMD ["node", "dist/main.js"]
