# AGENTS.md

This file provides context for AI coding assistants (Cursor, GitHub Copilot, Claude Code, etc.) working with the Vercel AI SDK repository.

## Project Overview

The **AI SDK** by Vercel is a TypeScript/JavaScript SDK for building AI-powered applications with LLMs. It provides a unified interface for multiple AI providers and framework integrations.

- **Repository**: https://github.com/vercel/ai
- **Documentation**: https://ai-sdk.dev/docs

## Repository Structure

Monorepo using pnpm workspaces and Turborepo.

| Directory                 | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `packages/ai`             | Main SDK package (`ai` on npm)                                       |
| `packages/provider`       | Provider interface specifications (`@ai-sdk/provider`)               |
| `packages/provider-utils` | Shared utilities for providers and core (`@ai-sdk/provider-utils`)   |
| `packages/<provider>`     | AI provider implementations (openai, anthropic, google, bedrock …)   |
| `packages/<framework>`    | UI framework integrations (react, vue, svelte, angular, rsc)         |
| `packages/codemod`        | Automated migrations for major releases                              |
| `examples/`               | Example applications                                                 |
| `content/`                | Documentation source files (MDX)                                     |
| `contributing/`           | Contributor guides and documentation                                 |

## Development Setup

- **Node.js**: v18, v20, or v22 (v22 recommended)
- **pnpm**: v10+

```bash
pnpm install   # Install all dependencies
pnpm build     # Build all packages
```

## Development Commands

| Command                  | Description                               |
| ------------------------ | ----------------------------------------- |
| `pnpm test`              | Run all tests (excludes examples)         |
| `pnpm check`             | Run linting (oxlint) and formatting       |
| `pnpm fix`               | Fix linting and formatting issues         |
| `pnpm type-check:full`   | TypeScript type checking (incl. examples) |
| `pnpm changeset`         | Add a changeset for your PR               |
| `pnpm update-references` | Update tsconfig.json references           |

Package-level: `pnpm build`, `pnpm test`, `pnpm test:node`, `pnpm test:edge`

## Core APIs

| Function                   | Purpose                    | Package |
| -------------------------- | -------------------------- | ------- |
| `generateText`             | Generate text completion   | `ai`    |
| `streamText`               | Stream text completion     | `ai`    |
| `generateObject`           | Generate structured output | `ai`    |
| `streamObject`             | Stream structured output   | `ai`    |
| `embed` / `embedMany`      | Generate embeddings        | `ai`    |
| `generateImage`            | Generate images            | `ai`    |
| `tool`                     | Define a tool              | `ai`    |

## Import Patterns

| What                               | Import From                                   |
| ---------------------------------- | --------------------------------------------- |
| Core functions, tool utilities     | `ai`                                          |
| Provider implementations           | `@ai-sdk/<provider>` (e.g., `@ai-sdk/openai`) |
| Error classes                      | `ai` (re-exports from `@ai-sdk/provider`)     |
| Provider type interfaces           | `@ai-sdk/provider`                            |
| Provider implementation utilities  | `@ai-sdk/provider-utils`                      |

## Coding Standards

- **Formatter**: oxfmt — **Linter**: oxlint (run via `pnpm fix` / `pnpm check`)
- **Tests**: Vitest — `*.test.ts` alongside source, type tests in `*.test-d.ts`
- **Zod**: use `zod/v4` for new code (`import { z } from 'zod/v4'`)
- **JSON**: never use `JSON.parse` directly — use `parseJSON`/`safeParseJSON` from `@ai-sdk/provider-utils`
- **File names**: `kebab-case.ts`

Always run `pnpm type-check:full` after code changes.

## Error Pattern

Errors extend `AISDKError` and use a symbol marker for `instanceof` checks:

```typescript
import { AISDKError } from '@ai-sdk/provider';
const name = 'AI_MyError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);
export class MyError extends AISDKError {
  private readonly [symbol] = true;
  static isInstance(error: unknown): error is MyError {
    return AISDKError.hasMarker(error, marker);
  }
}
```

## Architecture

**Provider Pattern** — layered adapter architecture:

1. **Specifications** (`@ai-sdk/provider`): Interfaces like `LanguageModelV4`
2. **Utilities** (`@ai-sdk/provider-utils`): Shared code for providers
3. **Providers** (`@ai-sdk/<provider>`): Concrete implementations
4. **Core** (`ai`): High-level functions (`generateText`, `streamText`, …)

**Provider Options Schemas** (user-facing): use `.optional()` unless `null` is meaningful; be restrictive.  
**Response Schemas** (API responses): use `.nullish()`; keep minimal; allow flexibility.

See `contributing/provider-architecture.md` and `architecture/provider-abstraction.md`.

## Architecture Decision Records (ADRs)

ADRs live in `contributing/decisions/`. Before making architectural changes, read relevant ADRs in that folder. If your change contradicts an accepted ADR, discuss first.

## Contributing Guides

| Task                  | Guide                                   |
| --------------------- | --------------------------------------- |
| Add new provider      | `contributing/add-new-provider.md`      |
| Add new model         | `contributing/add-new-model.md`         |
| Testing & fixtures    | `contributing/testing.md`               |
| Building new features | `contributing/building-new-features.md` |

See `CONTRIBUTING.md` for task completion guidelines (bug fixes, features, refactors).

## Changesets

Every PR modifying production code needs a changeset. Default: `patch`. Run `pnpm changeset`.

## Do Not

- Add minor/major changesets
- Change public APIs without updating documentation
- Use `require()` for imports
- Add new dependencies without running `pnpm update-references`
- Modify `content/docs/08-migration-guides` or `packages/codemod` as part of broader changes
