ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS runtime

WORKDIR /usr/src/app

RUN corepack enable

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=3000

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm fetch --frozen-lockfile --prod --store-dir=/pnpm/store

COPY nx.json tsconfig.base.json ./
COPY apps/api ./apps/api
COPY packages ./packages

RUN pnpm install --frozen-lockfile --offline --prod --store-dir=/pnpm/store \
  && rm -rf /pnpm/store

RUN mkdir -p volumes/uploads && chown -R node:node volumes

USER node

EXPOSE 3000

CMD ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "apps/api/src/server.ts"]
