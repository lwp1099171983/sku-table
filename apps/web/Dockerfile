FROM node:22-alpine AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/shared packages/shared
RUN pnpm --filter @sku-table/web build

FROM nginx:1.27-alpine
RUN rm -f /etc/nginx/conf.d/default.conf
COPY infra/nginx/app-vhost.conf.template /etc/nginx/app-vhost.conf.template
COPY infra/nginx/app-reject.conf /etc/nginx/app-reject.conf
COPY infra/nginx/05-app-vhost.sh /docker-entrypoint.d/05-app-vhost.sh
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
