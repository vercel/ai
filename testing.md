# Testing

Tests run via Vitest, with Playwright available for browser/e2e-style testing, orchestrated across packages using Turborepo.

## Test Tooling

- **Vitest** — primary test runner, present in `devDependencies` (`vitest`). No root-level Vitest config file is visible, so per-package config likely lives inside each package (not visible in this slice).
- **Playwright** — present via `@playwright/test` and `playwright` in `devDependencies`, used for browser-based or end-to-end tests.

Since this is a monorepo, actual test execution is delegated per-package through `turbo`; the root `package.json` scripts just fan out the `test` task across packages.

## Running Tests

- `npm run test` — runs `turbo test --concurrency 16 --filter=!@example/*`. Runs the `test` task in every package except those under the `@example/*` scope, up to 16 tasks concurrently.
- `npm run test:ci` — runs `turbo test --concurrency 16 --filter=!@example/* --filter=!ai --filter=!@ai-sdk/codemod --only`. Same as above but additionally excludes the `ai` and `@ai-sdk/codemod` packages, and uses `--only` to skip dependent task chaining — this is the CI-oriented variant.
- `npm run test:update` — runs `turbo test:update --concurrency 16 --filter=!@example/*`. Runs each package's `test:update` task (typically used to update test snapshots), excluding `@example/*` packages.

All three commands rely on individual packages defining their own `test` (and `test:update`) scripts — this root `package.json` only coordinates them via `turbo`.

## Confidence & Assumptions

- No test configuration files (e.g. `vitest.config.ts`, `playwright.config.ts`) were visible in this slice, so exact test file patterns, directories, and coverage settings cannot be described. Assume these live inside individual packages.
- Could not verify which packages actually contain `test` or `test:update` scripts, or the unit/e2e split between Vitest and Playwright usage.
- No CI configuration was visible, so it's unclear whether `test:ci` is invoked automatically on push/PR or only run manually.
- No coverage thresholds or mocking conventions are visible in this slice.