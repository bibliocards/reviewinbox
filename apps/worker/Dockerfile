ARG NODE_VERSION=26.9.0

FROM node:${NODE_VERSION}-alpine AS runtime

WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN chmod a+r package.json pnpm-lock.yaml pnpm-workspace.yaml

RUN npm install --global "$(node --print 'require("./package.json").packageManager')"

RUN pnpm fetch --prod --store-dir=/pnpm/store

COPY nx.json tsconfig.base.json ./
COPY apps/worker ./apps/worker
COPY packages ./packages

RUN pnpm install --frozen-lockfile --offline --prod --store-dir=/pnpm/store \
  && rm -rf /pnpm/store

RUN mkdir -p volumes/uploads && chown -R node:node node_modules volumes

USER node

CMD ["pnpm", "exec", "tsx", "--tsconfig", "tsconfig.base.json", "apps/worker/src/main.ts"]
