FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/shared packages/shared
RUN pnpm --filter @sku-table/shared build
RUN pnpm --filter @sku-table/api build
RUN pnpm --filter @sku-table/api deploy --prod --legacy /tmp/api-deploy

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /tmp/api-deploy/node_modules ./node_modules
COPY --from=build /tmp/api-deploy/package.json ./package.json
COPY --from=build /workspace/apps/api/dist ./dist
COPY --from=build /workspace/apps/api/src/db/migrations ./dist/db/migrations
EXPOSE 3000
CMD ["node", "dist/server.js"]
