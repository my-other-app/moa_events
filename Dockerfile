# syntax=docker/dockerfile:1
#
# The public site (https://myotherapp.in) as a self-hosted Next.js server, for
# the one Oracle box that runs everything (moa_backend: ops/server and
# docs/MOVE_TO_ORACLE.md). CI (.github/workflows/image.yml) builds it for
# linux/amd64 and linux/arm64 and pushes ghcr.io/my-other-app/moa-website.
# Vercel never reads this file.
#
# What is fixed at build time, and how it gets in:
#   - NEXT_PUBLIC_* (and ANDROID_APP_SHA256, DEMO_NOINDEX, DEMO_CLUB_SLUGS,
#     which static pages read while they are prerendered) come from a dotenv
#     file mounted as the build secret `build_env`: CI passes
#     deploy/build/<environment>.env, so one image is built per environment.
#     NEXT_PUBLIC_* values end up in the browser bundles: public by design.
#   - SENTRY_AUTH_TOKEN (source-map upload) and API_SITE_TOKEN (the API reads
#     made while prerendering) are real secrets: mounted for the build step
#     only, never in a layer, an ARG or the image history.
# Everything else (API_BASE_URL, API_SITE_TOKEN, REVALIDATE_SECRET...) is read
# at run time from the server's env file (ops/server/env/website.env.example).
#
# Local build (no secrets, production values):
#   docker buildx build --secret id=build_env,src=deploy/build/production.env -t moa-website .

ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# glibc shims for the odd prebuilt binary; sharp and Next's compiler ship musl
# builds of their own (both are in package-lock.json for x64 and arm64).
# hadolint ignore=DL3018
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# The commit, for Sentry's release name; the environment, for its default
# environment name. Neither is secret.
ARG GIT_SHA=""
ARG BUILD_ENVIRONMENT=production
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
# The dotenv file is read line by line (KEY=value, no quotes, # comments):
# nothing in it is run as shell (export "$line" exports KEY=value).
# hadolint ignore=SC2163
RUN --mount=type=secret,id=build_env \
    --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    --mount=type=secret,id=api_site_token,env=API_SITE_TOKEN \
    set -eu; \
    if [ -f /run/secrets/build_env ]; then \
      n=0; \
      while IFS= read -r line || [ -n "$line" ]; do \
        n=$((n + 1)); \
        case "$line" in \
          ''|'#'*) continue ;; \
          [A-Z_]*=*) export "$line" ;; \
          *) echo "build_env line $n is not KEY=value" >&2; exit 1 ;; \
        esac; \
      done < /run/secrets/build_env; \
    fi; \
    if [ -n "$GIT_SHA" ] && [ -z "${NEXT_PUBLIC_SENTRY_RELEASE:-}" ]; then export NEXT_PUBLIC_SENTRY_RELEASE="moa-events@$GIT_SHA"; fi; \
    export NEXT_PUBLIC_SENTRY_ENVIRONMENT="${NEXT_PUBLIC_SENTRY_ENVIRONMENT:-$BUILD_ENVIRONMENT}"; \
    npm run build

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Owned by the image's unprivileged `node` user: the server rewrites pages it
# regenerates (ISR) under .next/server, and keeps its data and image caches in
# .next/cache -- a volume on the server, so they outlive a deploy.
COPY --from=build --chown=1000:1000 /app/public ./public
COPY --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --from=build --chown=1000:1000 /app/.next/static ./.next/static
RUN mkdir -p .next/cache && chown 1000:1000 .next/cache
# 1000 is the image's own unprivileged `node` user.
USER 1000:1000
EXPOSE 3000
# A static file: answers as soon as the server listens, asks the API nothing.
# Asked every 2 s while it starts, so a deploy sees it healthy at once.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --start-interval=2s --retries=3 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/favicon.ico"]
CMD ["node", "server.js"]
