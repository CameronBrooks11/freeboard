# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/api/tsconfig.json packages/api/tsconfig.json
COPY packages/api/tsconfig.build.json packages/api/tsconfig.build.json
RUN npm ci --workspace=packages/api --include-workspace-root=false \
  && npm cache clean --force

COPY packages/api ./packages/api
RUN npm run build --workspace=packages/api

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=packages/api --include-workspace-root=false \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY packages/api/package.json ./packages/api/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
RUN chown -R node:node /app

USER node
EXPOSE 4001
CMD ["node", "packages/api/dist/index.js"]
