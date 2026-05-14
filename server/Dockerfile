# Stage 1: Build
FROM node:20-alpine AS builder

# Build tools needed for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy server configuration
COPY package.json ./

# Install dependencies
RUN npm install

# Copy server source
COPY . .

# Build the server
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy server configuration
COPY package.json ./

# Install ONLY production dependencies
RUN npm install --omit=dev

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite and set permissions
RUN mkdir -p /app/data && chown -R node:node /app/data

USER node

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "dist/server.js"]
