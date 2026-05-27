FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

# Playwright deps (chromium) — needed for HTML→PNG export
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
    libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 \
    fonts-liberation ca-certificates wget \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
# pnpm-workspace.yaml carries the build-script policy (onlyBuiltDependencies);
# pnpm 11 reads it from there, so it must be present before install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
RUN pnpm exec playwright install chromium

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /root/.cache/ms-playwright /root/.cache/ms-playwright
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /root/.cache/ms-playwright /root/.cache/ms-playwright
EXPOSE 3000
# Invoke binaries directly (no pnpm wrapper): avoids pnpm 11's
# verify-deps-before-run install check at startup, and `next start` binds to
# the PORT env var that the platform provides (Railway sets PORT).
CMD ["sh","-c","node_modules/.bin/drizzle-kit migrate && node_modules/.bin/next start"]
