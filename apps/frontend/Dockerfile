# ==============================================================================
# Dwellio Frontend Service — Production Multi-Stage Dockerfile
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build & Compile React / Vite Production Bundle
# ------------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests and package locks
COPY package.json package-lock.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/frontend/package.json ./apps/frontend/

# Deterministic dependency installation
RUN npm ci

# Copy source code for shared library and frontend application
COPY packages/shared ./packages/shared
COPY apps/frontend ./apps/frontend

# Compile shared library then Vite production bundle
RUN npm run build:shared && npm run build:frontend

# ------------------------------------------------------------------------------
# Stage 2: Serve Production Assets via Nginx Reverse-Proxy
# ------------------------------------------------------------------------------
FROM nginx:alpine AS runner

# Remove default nginx welcome page
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration for SPA routing and /api reverse-proxying
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy compiled static assets from builder stage
COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

# Container healthcheck against /
HEALTHCHECK --interval=20s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
