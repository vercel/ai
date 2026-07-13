# Local Development

This is a monorepo (managed with Turborepo and pnpm workspaces) containing the `ai` SDK packages and example apps, including Next.js example projects.

## Prerequisites

- `pnpm` (this repo uses pnpm workspaces — do not use `npm` or `yarn` for installs).
- Node.js `^22.0.0 || ^24.0.0 || ^26.0.0` (pinned in the repo's runtime requirements).

## Setup

1. Clone the repo and `cd` into it.
2. Install dependencies: `pnpm install`. This installs dependencies for all packages and example apps in the workspace and triggers the `prepare` script (`husky`), which sets up git hooks.
3. No `.env.example` or environment variable template is present in this repo — no environment configuration step is required to get local development running.

## Run

- `pnpm dev` — runs `turbo dev --cache=local:r,remote:r --concurrency 25 --continue` across the workspace. This starts the dev tasks for packages and example apps (including the Next.js examples) in parallel via Turborepo. Use this to get something running locally.
- `pnpm build` — runs `turbo build --concurrency 16`, building all packages and apps in the workspace.
- `pnpm build:packages` — builds only the `@ai-sdk/*` packages and the `ai` package, skipping examples.
- `pnpm build:examples` — builds only the `@example/*` apps.

## Common Tasks

- `pnpm test` — runs `turbo test` across all packages except `@example/*`.
- `pnpm test:update` — runs tests with snapshot/update mode, excluding examples.
- `pnpm test:ci` — CI-scoped test run with additional package filters.
- `pnpm type-check` — runs `tsc --build` for the workspace.
- `pnpm type-check:full` — type-checks including the examples project references (`tsconfig.with-examples.json`).
- `pnpm check` — runs `ultracite check` (lint/format check).
- `pnpm fix` — runs `ultracite fix` (auto-fix lint/format issues).
- `pnpm changeset` — creates a changeset for a version bump/release note.
- `pnpm konsistent` — runs `konsistent validate` and `konsistent:check` against `.github/konsistent.json`.
- `pnpm validate:docs` — runs `tools/validate-properties-tables.mjs` to validate documentation property tables.
- `pnpm clean` — runs `turbo clean` to clear build artifacts.
- `pnpm worktree:setup` — runs `tools/worktree-setup.sh`, likely a helper for setting up git worktrees (see assumptions).

## Confidence & Assumptions

- No `.env.example` or similar env template file was found in the payload — assumed no environment variables are required for local setup. If example apps (e.g. Next.js examples) require API keys (such as AI provider keys), this was not visible and should be confirmed by checking individual example app directories.
- `pnpm dev` is inferred to start Next.js example apps because the repo's `framework` is listed as Next.js and `build:examples` targets `@example/*` packages, but the exact set of apps/packages started by `turbo dev` was not directly visible.
- The purpose of `tools/worktree-setup.sh` (`worktree:setup` script) is not detailed in the payload — described generically based on the script name.
- No CI, deployment, or hosting configuration was visible in this slice, so none is described here.
- No database or external service setup steps were visible; none are included above.