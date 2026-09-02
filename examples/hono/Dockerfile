# Build context: examples/hono/
# docker build -t ai-sdk-hono .
#
# Cloud Run sets PORT automatically (default 8080). Pass your LLM provider key
# via --update-secrets at deploy time, e.g.:
#   gcloud run deploy ... --update-secrets OPENAI_API_KEY=openai-api-key:latest

FROM node:22-alpine AS deps

# Enable pnpm via corepack (Node 22 ships with corepack)
RUN corepack enable && corepack prepare pnpm@10 --activate

WORKDIR /app

# Copy manifests first for better layer caching
COPY package.json tsconfig.json ./
COPY src/ ./src/

# The repo uses pnpm workspaces; replace workspace:* refs with published
# versions so this example can be built as a standalone image, and add
# the pnpm.onlyBuiltDependencies config that pnpm 10+ requires to allow
# esbuild's install script (needed by tsx).
RUN node -e " \
  const fs = require('fs'); \
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8')); \
  p.dependencies['ai'] = '^7.0.16'; \
  p.dependencies['@ai-sdk/openai'] = '^4.0.8'; \
  p.pnpm = { onlyBuiltDependencies: ['esbuild'] }; \
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2)); \
"

RUN pnpm install --no-frozen-lockfile

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# tsx is a dev-dependency used to run TypeScript directly; keep it in the final
# image because we're not doing a separate compile step here.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY tsconfig.json ./
COPY src/ ./src/

# Cloud Run injects PORT; fall back to 8080 for local docker run.
ENV PORT=8080
EXPOSE 8080

# Run TypeScript directly with tsx (avoids a separate compile step and keeps
# the image simple; switch to a tsc→node pipeline for production hardening).
CMD ["node_modules/.bin/tsx", "src/server.ts"]
