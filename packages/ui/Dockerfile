# syntax=docker/dockerfile:1.7

FROM node:20.11.1-alpine3.20 AS build-stage
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --workspace=packages/ui --include-workspace-root=false \
  && npm cache clean --force

COPY packages/ui ./packages/ui
RUN npm run build --workspace=packages/ui

FROM nginxinc/nginx-unprivileged:1.27-alpine AS production-stage
COPY --from=build-stage /app/packages/ui/dist /usr/share/nginx/html
COPY packages/ui/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
