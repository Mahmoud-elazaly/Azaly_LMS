FROM node:24-bookworm-slim AS package-manager
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM package-manager AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM dependencies AS migrate
COPY drizzle.config.ts ./
COPY scripts/identity-admin.mjs ./scripts/identity-admin.mjs
COPY src/db ./src/db
COPY src/features/identity/policy.ts ./src/features/identity/policy.ts
USER node
CMD ["pnpm", "db:migrate"]

FROM dependencies AS dev
COPY --chown=node:node . .
RUN chown node:node /app
ENV NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM dependencies AS browser
ENV PLAYWRIGHT_BROWSERS_PATH=/opt/playwright
RUN pnpm exec playwright install --with-deps chromium \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node . .
RUN chown node:node /app
ENV NEXT_TELEMETRY_DISABLED=1
USER node
CMD ["pnpm", "dev", "--hostname", "0.0.0.0"]

FROM node:24-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
