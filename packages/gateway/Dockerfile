# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/gateway/package.json packages/gateway/package.json
RUN npm ci --omit=dev --workspace=packages/gateway --include-workspace-root=false \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/gateway ./packages/gateway
RUN chown -R node:node /app

USER node
EXPOSE 8001
CMD ["node", "packages/gateway/src/index.js"]
