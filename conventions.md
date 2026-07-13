# Conventions

Code quality in this repo is enforced primarily through `oxlint`/`oxfmt` (wrapped by `ultracite`), with `husky` and `lint-staged` wiring checks into git hooks. TypeScript is used throughout, though its compiler settings aren't visible in this slice.

## Linting & Formatting

- **oxlint** — a Rust-based linter. No dedicated config file is visible in this slice.
- **oxfmt** — a formatter paired with oxlint. No dedicated config file is visible in this slice.
- **ultracite** — wraps the above; run it via `npm run check` (maps to `ultracite check`).
- **lint-staged** + **husky** — present as dependencies, implying lint/format checks run automatically on git commit via a pre-commit hook. No hook script or `lint-staged` config file is visible in this slice to confirm exactly what runs.
- **publint** — run via `npm run publint` (maps to `turbo publint`); checks published package output rather than source style.

No `eslint`, `prettier`, `biome`, or `stylelint` packages are present — this repo does not use any of those tools.

## Code Style

No styling stack (Tailwind, CSS Modules, styled-components, etc.) is visible in this slice — no related packages or config files were provided.

## TypeScript

TypeScript is a dependency, so the codebase is written in TypeScript, but no `tsconfig.json` contents were included in this slice — cannot enumerate compiler options (strictness, target, module resolution, etc.) from what's available here.

## Confidence & Assumptions

- No config files (e.g. `oxlint.json`, `.oxfmtrc`, `lint-staged.config.js`, `.husky/pre-commit`) were visible in this slice, so exact lint rules and hook behavior are unconfirmed — only the tool names and the `check`/`publint` scripts could be verified.
- Assumed `lint-staged` + `husky` together mean a pre-commit hook runs linting/formatting, but the actual hook script wasn't visible.
- No `tsconfig.json` contents were provided — cannot describe strictness or compiler target.
- No styling-related packages or config files were present, so this document omits a Code Style styling subsection beyond noting the gap.
- Framework is listed as Next.js, but no folder layout was included in this slice, so no claims are made about App Router vs Pages Router or file-based conventions.