ARG NODE_VERSION=24
ARG NGINX_VERSION=stable-alpine

FROM node:${NODE_VERSION}-alpine AS base

WORKDIR /usr/src/app

RUN corepack enable

FROM base AS deps

ENV HUSKY=0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json .postcssrc.json ./
COPY apps/web ./apps/web
COPY packages ./packages

RUN pnpm install --frozen-lockfile

FROM deps AS build

ARG ENVIRONMENT=production

RUN pnpm nx build web --configuration=${ENVIRONMENT}

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS serve

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/dist/apps/web/browser /usr/share/nginx/html

ENV REVIEWINBOX_API_URL=""
ENV REVIEWINBOX_AUTH_BASE_PATH="/api/auth"
ENV DEPLOYMENT_MODE="self-hosted"
ENV REVIEWINBOX_AUTH_GOOGLE_ENABLED="false"
ENV REVIEWINBOX_AUTH_SSO_ENABLED="false"
ENV NGINX_ENVSUBST_TEMPLATE_DIR="/usr/share/nginx/html"
ENV NGINX_ENVSUBST_OUTPUT_DIR="/usr/share/nginx/html"
ENV NGINX_ENVSUBST_TEMPLATE_SUFFIX=".template"

RUN find /usr/share/nginx/html -type f -name 'main*.js' -exec cp {} {}.template \;
