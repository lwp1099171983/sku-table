FROM node:22-alpine AS build
WORKDIR /workspace
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
RUN npm install --ignore-scripts --no-audit --no-fund
COPY apps/api apps/api
RUN npm --workspace @sku-table/api run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/apps/api/dist ./dist
COPY apps/api/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/server.js"]
