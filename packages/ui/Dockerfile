# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.13.1-alpine
ARG NPM_VERSION=11.10.0

# Build static assets on the builder's native architecture to avoid qemu OOM
# during arm/v7 legacy image publication. The produced dist assets are
# architecture-agnostic and copied into the target runtime image.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build-stage
WORKDIR /app

RUN npm install -g npm@${NPM_VERSION}

COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/package.json
COPY tsconfig.base.json ./tsconfig.base.json
# Build stage must include root toolchain deps (shared workspace tooling/overrides).
RUN npm ci --workspace=packages/ui --include-workspace-root=true \
  && npm cache clean --force

COPY packages/ui ./packages/ui
# The dashboard validator imports the canonical schema from the repo-root
# schema/ dir (single source of truth); the UI build bundles it, so it must be
# present in the build context.
COPY schema ./schema
RUN npm run build --workspace=packages/ui

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production-stage
COPY --from=build-stage /app/packages/ui/dist /usr/share/nginx/html
COPY packages/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
