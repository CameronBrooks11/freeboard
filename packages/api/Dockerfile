# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

FROM ${NODE_IMAGE} AS build
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
COPY tsconfig.base.json ./tsconfig.base.json
COPY packages/shared/tsconfig.json packages/shared/tsconfig.json
COPY packages/shared/tsconfig.build.json packages/shared/tsconfig.build.json
COPY packages/api/tsconfig.json packages/api/tsconfig.json
COPY packages/api/tsconfig.build.json packages/api/tsconfig.build.json
# Build stage must include root toolchain deps (e.g., TypeScript) plus workspace deps.
RUN npm ci --workspace=packages/api --include-workspace-root=true \
  && npm cache clean --force

COPY packages/shared ./packages/shared
COPY packages/api ./packages/api
RUN npm run build --workspace=packages/api

FROM ${NODE_IMAGE} AS deps
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/api/package.json packages/api/package.json
RUN npm ci --omit=dev --workspace=packages/api --include-workspace-root=false \
  && mkdir -p packages/api/node_modules \
  && npm cache clean --force

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
# npm installs per the lockfile tree: a workspace dep can be nested under
# packages/api/node_modules instead of hoisted to root when its version
# conflicts with another copy elsewhere (e.g. nanoid@5 here vs nanoid@3 pulled
# by the root dev dep vitepress->postcss). Copying only root node_modules drops
# those nested deps and the API crashes at runtime with ERR_MODULE_NOT_FOUND
# (#141). Ship the workspace-nested node_modules too.
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY packages/api/package.json ./packages/api/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
RUN chown -R node:node /app

USER node
EXPOSE 4001
CMD ["node", "packages/api/dist/index.js"]
