ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS runtime

WORKDIR /usr/src/app

RUN corepack enable

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml nx.json tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN pnpm install --frozen-lockfile

RUN mkdir -p volumes/uploads && chown -R node:node volumes

USER node

CMD ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "apps/worker/src/main.ts"]
