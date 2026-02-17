# syntax=docker/dockerfile:1.7

FROM node:24.13.1-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=packages/api --include-workspace-root=false \
  && npm cache clean --force

FROM node:24.13.1-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/api ./packages/api
RUN chown -R node:node /app

USER node
EXPOSE 4001
CMD ["node", "packages/api/src/index.js"]
