# Dockerfile for HTTP proxy service

# Use Node.js 18 Alpine image for lightweight container
FROM node:18-alpine

# Set working directory inside the container
WORKDIR /usr/app

# Copy source files into the container
COPY ./ /usr/app

# Install dependencies
RUN npm install

# Expose OAuth proxy HTTP port
EXPOSE 8001

# Command to start the OAuth proxy service
CMD [ "npm", "run", "start" ]
