# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/gateway/package.json packages/gateway/package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/tsconfig.build.json packages/shared/tsconfig.build.json
COPY packages/gateway/tsconfig.json packages/gateway/tsconfig.json
COPY packages/gateway/tsconfig.build.json packages/gateway/tsconfig.build.json
# Build stage must include root toolchain deps (e.g., TypeScript) plus workspace deps.
RUN npm ci --workspace=packages/gateway --include-workspace-root=true \
  && npm cache clean --force

COPY packages/shared ./packages/shared
COPY packages/gateway ./packages/gateway
RUN npm run build --workspace=packages/gateway

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/gateway/package.json packages/gateway/package.json
RUN npm ci --omit=dev --workspace=packages/gateway --include-workspace-root=false \
  && mkdir -p packages/gateway/node_modules \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# Ship workspace-nested deps too: npm can nest a dependency under
# packages/gateway/node_modules (instead of hoisting to root) on a version
# conflict, and copying only root node_modules would drop it at runtime. No
# gateway dep nests today, but this prevents the #141 class of failure. The
# mkdir above guarantees the path exists so this COPY is always valid.
COPY --from=deps /app/packages/gateway/node_modules ./packages/gateway/node_modules
COPY packages/gateway/package.json ./packages/gateway/package.json
COPY --from=build /app/packages/gateway/dist ./packages/gateway/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
RUN chown -R node:node /app

USER node
EXPOSE 8001
CMD ["node", "packages/gateway/dist/index.js"]
