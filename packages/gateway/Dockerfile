# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/gateway/package.json packages/gateway/package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/gateway/tsconfig.json packages/gateway/tsconfig.json
COPY packages/gateway/tsconfig.build.json packages/gateway/tsconfig.build.json
RUN npm ci --workspace=packages/gateway --include-workspace-root=false \
  && npm cache clean --force

COPY packages/gateway ./packages/gateway
RUN npm run build --workspace=packages/gateway

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
COPY packages/gateway/package.json ./packages/gateway/package.json
COPY --from=build /app/packages/gateway/dist ./packages/gateway/dist
RUN chown -R node:node /app

USER node
EXPOSE 8001
CMD ["node", "packages/gateway/dist/index.js"]
