# Production image for the frontend: Vite build served by Caddy, which also
# terminates HTTPS, proxies /api to the API container and issues on-demand
# certificates for school custom domains.
# Build from the repo root:  docker build -f deploy/web.Dockerfile -t peoplenit-web .

FROM node:20-bookworm-slim AS build
WORKDIR /app
ARG VITE_API_URL=/api/v1
ARG VITE_APP_HOSTS=
ARG VITE_PLATFORM_SITE_DOMAIN=
ARG VITE_CLOUDINARY_CLOUD_NAME=
ARG VITE_CLOUDINARY_UPLOAD_PRESET=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_HOSTS=$VITE_APP_HOSTS \
    VITE_PLATFORM_SITE_DOMAIN=$VITE_PLATFORM_SITE_DOMAIN \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace=frontend --include-workspace-root
COPY frontend frontend
RUN npm run build --workspace=frontend

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/frontend/dist /srv
