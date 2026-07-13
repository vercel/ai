# Architecture

This is a pnpm/Turborepo monorepo (`pnpm-workspace.yaml`, `turbo.json`) containing library packages and example applications. Build orchestration runs through `turbo build --concurrency 16`, which fans out builds across workspaces.

## Layout

- `packages` — workspace packages: the actual libraries published/maintained from this repo (monorepo root for installable code).
- `examples` — example projects demonstrating usage of the packages; these are consumers, not library code, and likely include Next.js apps given the `next` and `react`/`react-dom` dependencies.

## Key Modules

- `turbo.json` governs how builds, and likely tests/lint, are pipelined and cached across `packages` and `examples`. Check it to understand task dependencies before changing build behavior.
- `pnpm-workspace.yaml` defines which directories are workspaces — start here to see the full list of packages if `packages`/`examples` contain further subfolders.
- `@changesets/cli` is present, indicating package versioning/changelog generation is managed via Changesets — look for a `.changeset` directory when preparing a release-worthy change (not confirmed in this payload).
- Testing tools `vitest` and `@playwright/test` are both dependencies, suggesting unit/integration tests (vitest) and end-to-end or browser tests (Playwright) coexist somewhere in the packages or examples — exact test file locations aren't visible here.
- `konsistent` is listed as a notable library; its role (likely architectural/consistency linting) isn't described further in the available data.

## Boundaries & Constraints

Not enough folder detail is visible to state concrete boundaries (e.g., whether `packages` is framework-agnostic or depends on Next.js internals). Skipping this section beyond what's noted in Confidence & Assumptions.

## Confidence & Assumptions

- No subfolder structure inside `packages` or `examples` was provided — cannot enumerate individual package names or their responsibilities.
- Assumed `examples` contains Next.js apps based on `next` and `react`/`react-dom` appearing as notable libraries, but no example-specific config files (e.g., `next.config.js`) were listed to confirm this.
- The exact split of responsibilities between `vitest` and `@playwright/test` (unit vs. e2e) is inferred from typical usage of these tools, not confirmed by visible test config or folder paths.
- `konsistent`'s purpose is unclear from the given data — no description or usage context was provided.
- No CI configuration, deployment target, or environment variable files were visible, so none are described here.
- No styling setup (e.g., Tailwind, CSS modules) was listed, so styling architecture is not covered.