FROM node:24-bookworm-slim AS package-manager
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
COPY package.json ./
RUN --mount=type=cache,id=azaly-lms-corepack,target=/var/cache/corepack,sharing=locked \
    corepack enable \
    && COREPACK_HOME=/var/cache/corepack corepack install \
    && mkdir -p /opt/corepack \
    && cp -a /var/cache/corepack/. /opt/corepack/ \
    && chmod -R a+rX /opt/corepack

FROM package-manager AS dependencies
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=azaly-lms-pnpm,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --prefer-offline

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM dependencies AS migrate
COPY drizzle.config.ts ./
COPY scripts/identity-admin.mjs scripts/seed-prometheus-grafana.mjs ./scripts/
COPY src/db ./src/db
COPY src/features/identity/policy.ts ./src/features/identity/policy.ts
COPY src/features/assessment/policy.ts ./src/features/assessment/policy.ts
COPY src/features/authoring/policy.ts ./src/features/authoring/policy.ts
COPY src/features/guided/policy.ts ./src/features/guided/policy.ts
COPY src/features/curriculum/prometheus-grafana ./src/features/curriculum/prometheus-grafana
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
RUN --mount=type=cache,id=azaly-lms-apt-cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,id=azaly-lms-apt-lists,target=/var/lib/apt/lists,sharing=locked \
    --mount=type=cache,id=azaly-lms-playwright,target=/var/cache/ms-playwright,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
    && echo 'Binary::apt::APT::Keep-Downloaded-Packages "true";' > /etc/apt/apt.conf.d/keep-cache \
    && mkdir -p /var/cache/apt/archives/partial /var/lib/apt/lists/partial \
    && PLAYWRIGHT_BROWSERS_PATH=/var/cache/ms-playwright pnpm exec playwright install --with-deps chromium \
    && mkdir -p /opt/playwright \
    && cp -a /var/cache/ms-playwright/. /opt/playwright/ \
    && chmod -R a+rX /opt/playwright
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
