# Dockerfile for Freeboard UI service

# --- Build Stage ---

# Use Node.js 18 Alpine image for lightweight build environment
FROM node:18-alpine AS build-stage

# Set working directory inside the container
WORKDIR /usr/app

# Copy all source files into the container
COPY ./ /usr/app

# Install project dependencies
RUN npm install

# Build the production-ready app
RUN npm run build

# --- Production Stage ---

# Use latest Nginx image to serve the built app
FROM nginx:latest AS production-stage

# Copy the built app from the build stage into Nginx's public directory
COPY --from=build-stage /usr/app/dist /usr/share/nginx/html

# Copy custom Nginx configuration file into the container
COPY ./nginx.conf /etc/nginx/conf.d/default.conf

# Expose HTTP port
EXPOSE 80

# Command to start Nginx in the foreground
CMD ["nginx", "-g", "daemon off;"]
