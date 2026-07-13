# vercel/ai

The AI SDK: an open-source TypeScript toolkit for building AI-powered applications and agents. It provides a core library plus a shared provider abstraction so applications can talk to multiple LLM providers through a consistent API. Structured as a large pnpm/Turborepo monorepo.

## What This Is

- A developer library, not a deployable application — the repo ships packages consumed by other projects, not a running service.
- Core piece is the `ai` package, built on a shared provider abstraction with first-party integrations for OpenAI, Anthropic, Google, xAI, Cohere, Groq, Amazon Bedrock, and others.
- Includes a separate `examples/` tree (often Next.js/React apps) demonstrating usage of the SDK.
- Release management runs through Changesets, and the repo carries internal tooling (konsistent, update-ts-references) to keep TypeScript project references and docs consistent across packages.

## Stack

TypeScript monorepo orchestrated with Turborepo and pnpm; Next.js/React appear in the examples rather than as an application framework for the SDK itself.

- Language: TypeScript throughout
- Build/dev orchestration: `turbo` (Turborepo)
- Framework: Next.js (used in `examples/`), React / React-DOM
- Testing: Vitest, `@playwright/test`
- Linting/formatting: oxlint, oxfmt, ultracite (per stack summary — no config files shown in this slice)
- Versioning/release: `@changesets/cli`
- Internal consistency tooling: `konsistent`
- Runtime: Node.js `^22.0.0 || ^24.0.0 || ^26.0.0`

## Where To Look Next

- `packages` — the SDK itself: the core `ai` library, the provider abstraction, and individual LLM provider integrations.
- `examples` — sample applications (Next.js/React-based) showing how to consume the SDK.

## Confidence & Assumptions

- No `folderPurposes` text was provided for `packages` or `examples`; descriptions above are inferred from the stack summary, not from explicit per-folder documentation.
- No README content was included (`readmeSummary` was empty), so the project description relies entirely on the stack summary.
- Linting tools (oxlint, oxfmt, ultracite) are mentioned in the stack summary but no corresponding config files were visible in this slice — cannot confirm exact setup.
- No `deploymentTarget`, CI configuration, or npm scripts were included, so build/test/deploy commands are not documented here — check `package.json` and `turbo.json` directly for actual scripts.
- Next.js/React are listed as notable libraries but the folder layout doesn't clarify App Router vs Pages Router; assumed they apply mainly to `examples/`, not the core SDK, based on the stack summary's framing of this as "a developer library rather than a deployable application."