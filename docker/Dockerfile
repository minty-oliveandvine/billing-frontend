# Development image for the billing (Module 2) frontend (Next.js 16).
# Optimized for local dev with hot-reload — source is bind-mounted at runtime
# (see docker/stack/docker-compose.yml in the Minty repo), so we only bake in
# the dependencies here.
FROM node:22-alpine

WORKDIR /app

# Install dependencies first so this layer is cached unless the lockfile changes.
# Copy only the manifest + lockfile to maximize cache hits.
COPY package.json package-lock.json ./
RUN npm ci

# App source is bind-mounted over /app at runtime for hot-reload, so we don't
# COPY it here. The bind mount excludes node_modules (see compose) to keep the
# container's installed deps.

# Next.js dev server port (the onboarding frontend uses 3001).
EXPOSE 3000

# `npm run dev` already passes -H 0.0.0.0 (see package.json), so the dev server
# is reachable from the host.
CMD ["npm", "run", "dev"]
