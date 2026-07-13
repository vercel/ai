# AGENTS.md

## Stack Overview
`vercel/ai` is the AI SDK, a TypeScript toolkit for building AI-powered applications and agents. It is structured as a pnpm/Turborepo monorepo containing the core `ai` package, a shared provider abstraction, and numerous first-party LLM provider integrations, plus a separate `examples/` directory (often Next.js/React apps). This is a library/monorepo, not a deployable application — there is no deployment target configured. Node.js `^22.0.0 || ^24.0.0 || ^26.0.0` is required.

## Running, Building, Testing
Package manager is `pnpm`. All cross-package orchestration goes through Turborepo (`turbo.json`).

- `pnpm build` — `turbo build --concurrency 16`, builds all workspace packages.
- `pnpm build:packages` — builds only `@ai-sdk/*` and `ai` packages (excludes examples).
- `pnpm build:examples` — builds only `@example/*` packages.
- `pnpm dev` — `turbo dev` with local/remote cache read-only and `--continue`, for iterative dev across packages.
- `pnpm test` — `turbo test --concurrency 16 --filter=!@example/*`, runs tests (Vitest) for all packages except examples.
- `pnpm test:ci` — CI variant of test, additionally excluding `ai` and `@ai-sdk/codemod`, run with `--only`.
- `pnpm test:update` — updates test snapshots across non-example packages.
- `pnpm type-check` — `tsc --build` using TypeScript project references.
- `pnpm type-check:full` — type-checks including examples via `tsconfig.with-examples.json`.
- `pnpm check` / `pnpm fix` — run `ultracite check` / `ultracite fix` (lint/format wrapper).
- `pnpm konsistent` — runs `konsistent:validate` and `konsistent:check` together via Turbo, using `.github/konsistent.json`.
- `pnpm update-references` — regenerates TypeScript project references (`update-ts-references`) and splits them (`tools/split-ts-references.mjs`).
- `pnpm validate:docs` — validates properties tables in docs (`tools/validate-properties-tables.mjs`).
- `pnpm changeset` — creates a changeset for a pending release.
- `pnpm ci:version` / `pnpm ci:release` — changeset version/publish flow; not meant to be run manually outside CI/release process.
- `pnpm clean` — `turbo clean`.
- `pnpm worktree:setup` — runs `tools/worktree-setup.sh` (purpose not documented beyond the script name — verify before relying on it).
- `pnpm prepare` — runs `husky` to install git hooks (executed automatically after install).

## Folder Conventions
- `packages/` — the monorepo workspace packages: the core `ai` library, `@ai-sdk/*` provider integrations, and shared tooling packages. This is where library source code lives.
- `examples/` — standalone example projects (frequently Next.js/React apps) demonstrating SDK usage. Excluded from the default `test` and filtered separately in `build:examples`.
- Workspace membership and package boundaries are defined in `pnpm-workspace.yaml`; task pipelines and caching behavior are defined in `turbo.json` — check both before adding a new package or script.

## Patterns To Follow
- Use `pnpm` exclusively (workspace uses `pnpm-workspace.yaml`); do not use `npm` or `yarn` to install or add dependencies.
- Run tasks through Turbo filters (`--filter=@ai-sdk/*`, `--filter=!@example/*`, etc.) rather than invoking a package's script directly, to stay consistent with existing CI commands.
- Add a changeset (`pnpm changeset`) for any change to a published package under `packages/`, since releases are managed via `@changesets/cli`.
- After adding/removing/moving packages or changing internal `tsconfig` references, run `pnpm update-references` to keep TypeScript project references in sync — the build relies on `tsc --build`.
- Use `pnpm check` / `pnpm fix` (Ultracite, wrapping `oxlint`/`oxfmt`) for linting and formatting rather than invoking `oxlint`/`oxfmt` directly, to match the configured ruleset.
- Write unit/integration tests with Vitest; use Playwright (`@playwright/test`) only for end-to-end scenarios where it's already set up.

## Patterns To Avoid
- Do not run a plain `npm install` or commit a `package-lock.json` / `yarn.lock` — this breaks the pnpm workspace.
- Do not include `examples/` or `@example/*` packages in library test/build commands intended for `packages/` — they are explicitly filtered out (`--filter=!@example/*`) in `test` and `test:ci`.
- Do not bypass `changeset` for changes intended to be published — `ci:version`/`ci:release` depend on changesets existing.
- Do not hand-edit generated TypeScript project reference files; regenerate them with `pnpm update-references` instead.
- Do not add ESLint/Prettier configs alongside the existing oxlint/oxfmt/Ultracite setup — this repo uses `oxlint`/`oxfmt` via `ultracite`, not the ESLint/Prettier stack.

## Gotchas
- Node version is constrained to `^22.0.0 || ^24.0.0 || ^26.0.0` — verify your local Node version matches before installing or running scripts.
- `test:ci` deliberately excludes the `ai` package and `@ai-sdk/codemod` in addition to examples — local `test` results may not fully match CI for those packages.
- `husky` hooks are installed via the `prepare` script, which runs automatically on `pnpm install`; if hooks seem missing, re-run `pnpm install`.
- `lint-staged` is present as a dev dependency, implying pre-commit linting is wired through Husky — check `.husky/` and `package.json` `lint-staged` config (not shown here) if commits are being blocked or reformatted unexpectedly.
- `konsistent` has its own config at `.github/konsistent.json` and separate `validate`/`check` sub-scripts — failures here are a distinct category from type-check or lint failures.
- No environment variable keys are declared at the root; individual provider packages or examples likely require their own API keys (e.g. for OpenAI, Anthropic, etc.) but none are documented at this level — check each package/example's own docs before running it.

## Confidence & Assumptions
- No `envExampleKeys` were found at the root, so no environment variables are documented here — assume individual provider packages/examples require their own API keys, but this is not verifiable from the given data.
- The Next.js version is unspecified (`version: null`); Next.js appears only as a devDependency, likely used for `examples/`, not for the core library itself — could not confirm App Router vs Pages Router usage, or whether Next.js is used anywhere outside examples.
- `pnpm worktree:setup` and `tools/worktree-setup.sh` purpose is inferred only from the script name; actual behavior not verified.
- No CI configuration file was listed in key config files, though `test:ci` and `ci:release`/`ci:version` scripts imply a CI pipeline exists (likely GitHub Actions, given `.github/scripts/` references) — could not confirm specifics.
- No deployment target is configured or implied; this repo is treated as a library/monorepo, not a deployable app.
- `readmeSummary` was empty, so no additional project framing beyond the stack summary was available.