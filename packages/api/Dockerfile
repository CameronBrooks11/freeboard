# Dockerfile for Freeboard API service

# Use official Node.js 18 Alpine image for a lightweight runtime
FROM node:18-alpine

# Default secure runtime mode (can be overridden by environment)
ENV NODE_ENV=production

# Set working directory inside the container
WORKDIR /usr/app

# Copy all source files into the working directory
COPY ./ /usr/app

# Install project dependencies
RUN npm install

# Expose the port the API listens on
EXPOSE 4001

# Default command to start the API server
CMD [ "npm", "run", "start" ]
