# AGENTS.md

This file provides context for AI coding assistants (Cursor, GitHub Copilot, Claude Code, etc.) working with the Vercel AI SDK repository.

## Project Overview

The **AI SDK** by Vercel is a TypeScript/JavaScript SDK for building AI-powered applications with Large Language Models (LLMs). It provides a unified interface for multiple AI providers and framework integrations.

- **Repository**: https://github.com/vercel/ai
- **Documentation**: https://ai-sdk.dev/docs
- **License**: Apache-2.0

## Repository Structure

This is a **monorepo** using pnpm workspaces and Turborepo.

### Key Directories

| Directory                 | Description                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------ |
| `packages/ai`             | Main SDK package (`ai` on npm)                                                       |
| `packages/provider`       | Provider interface specifications (`@ai-sdk/provider`)                               |
| `packages/provider-utils` | Shared utilities for providers and core (`@ai-sdk/provider-utils`)                   |
| `packages/<provider>`     | AI provider implementations (openai, anthropic, google, azure, amazon-bedrock, etc.) |
| `packages/<framework>`    | UI framework integrations (react, vue, svelte, angular, rsc)                         |
| `packages/codemod`        | Automated migrations for major releases                                              |
| `examples/`               | Example applications (ai-core, next-openai, etc.)                                    |
| `content/`                | Documentation source files (MDX)                                                     |
| `contributing/`           | Contributor guides and documentation                                                 |
| `tools/`                  | Internal tooling (eslint-config, tsconfig)                                           |

### Core Package Dependencies

```
ai ─────────────────┬──▶ @ai-sdk/provider-utils ──▶ @ai-sdk/provider
                    │
@ai-sdk/<provider> ─┴──▶ @ai-sdk/provider-utils ──▶ @ai-sdk/provider
```

## Development Setup

### Requirements

- **Node.js**: v18, v20, or v22 (v22 recommended for development)
- **pnpm**: v10+ (`npm install -g pnpm@10`)

### Initial Setup

```bash
pnpm install        # Install all dependencies
pnpm build          # Build all packages
```

## Development Commands

### Root-Level Commands

| Command                  | Description                                                       |
| ------------------------ | ----------------------------------------------------------------- |
| `pnpm install`           | Install dependencies                                              |
| `pnpm build`             | Build all packages                                                |
| `pnpm test`              | Run all tests (excludes examples)                                 |
| `pnpm lint`              | Run linting                                                       |
| `pnpm prettier-fix`      | Fix formatting issues                                             |
| `pnpm prettier-check`    | Check formatting                                                  |
| `pnpm type-check`        | TypeScript type checking                                          |
| `pnpm changeset`         | Add a changeset for your PR                                       |
| `pnpm update-references` | Update tsconfig.json references after adding package dependencies |

### Package-Level Commands

Run these from within a package directory (e.g., `packages/ai`):

| Command            | Description                 |
| ------------------ | --------------------------- |
| `pnpm build`       | Build the package           |
| `pnpm build:watch` | Build with watch mode       |
| `pnpm test`        | Run all tests (node + edge) |
| `pnpm test:node`   | Run Node.js tests only      |
| `pnpm test:edge`   | Run Edge runtime tests only |
| `pnpm test:watch`  | Run tests in watch mode     |

### Running Examples

```bash
cd examples/ai-core
pnpm tsx src/stream-text/openai.ts    # Run a specific example
```

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
| `jsonSchema` / `zodSchema` | Define schemas             | `ai`    |

## Import Patterns

| What                                          | Import From                                   |
| --------------------------------------------- | --------------------------------------------- |
| Core functions (`generateText`, `streamText`) | `ai`                                          |
| Tool/schema utilities (`tool`, `jsonSchema`)  | `ai`                                          |
| Provider implementations                      | `@ai-sdk/<provider>` (e.g., `@ai-sdk/openai`) |
| Error classes                                 | `ai` (re-exports from `@ai-sdk/provider`)     |
| Provider type interfaces (`LanguageModelV3`)  | `@ai-sdk/provider`                            |
| Provider implementation utilities             | `@ai-sdk/provider-utils`                      |

## Coding Standards

### Formatting

- **Tool**: Prettier
- **Config**: Defined in root `package.json`
- **Settings**: Single quotes, trailing commas, 2-space indentation, no tabs
- **Run**: `pnpm prettier-fix` before committing

### Testing

- **Framework**: Vitest
- **Test files**: `*.test.ts` alongside source files
- **Type tests**: `*.test-d.ts` for type-level tests
- **Fixtures**: Store in `__fixtures__` subfolders
- **Snapshots**: Store in `__snapshots__` subfolders

### Zod Usage

The SDK supports both Zod 3 and Zod 4. Use correct imports:

```typescript
// For Zod 3 (compatibility code only)
import * as z3 from 'zod/v3';

// For Zod 4
import * as z4 from 'zod/v4';
// Use z4.core.$ZodType for type references
```

### JSON parsing

Never use `JSON.parse` directly in production code to prevent security risks.
Instead use `parseJSON` or `safeParseJSON` from `@ai-sdk/provider-utils`.

### File Naming Conventions

- Source files: `kebab-case.ts`
- Test files: `kebab-case.test.ts`
- Type test files: `kebab-case.test-d.ts`
- React/UI components: `kebab-case.tsx`

## Error Pattern

Errors extend `AISDKError` from `@ai-sdk/provider` and use a marker pattern for `instanceof` checks:

```typescript
import { AISDKError } from '@ai-sdk/provider';

const name = 'AI_MyError';
const marker = `vercel.ai.error.${name}`;
const symbol = Symbol.for(marker);

export class MyError extends AISDKError {
  private readonly [symbol] = true; // used in isInstance

  constructor({ message, cause }: { message: string; cause?: unknown }) {
    super({ name, message, cause });
  }

  static isInstance(error: unknown): error is MyError {
    return AISDKError.hasMarker(error, marker);
  }
}
```

## Architecture

### Provider Pattern

The SDK uses a layered provider architecture following the adapter pattern:

1. **Specifications** (`@ai-sdk/provider`): Defines interfaces like `LanguageModelV3`
2. **Utilities** (`@ai-sdk/provider-utils`): Shared code for implementing providers
3. **Providers** (`@ai-sdk/<provider>`): Concrete implementations for each AI service
4. **Core** (`ai`): High-level functions like `generateText`, `streamText`, `generateObject`

### Provider Development

**Provider Options Schemas** (user-facing):

- Use `.optional()` unless `null` is meaningful
- Be as restrictive as possible for future flexibility

**Response Schemas** (API responses):

- Use `.nullish()` instead of `.optional()`
- Keep minimal - only include properties you need
- Allow flexibility for provider API changes

### Adding New Packages

1. Create folder under `packages/<name>`
2. Add to root `tsconfig.json` references
3. Run `pnpm update-references` if adding dependencies between packages

## Contributing Guides

| Task                  | Guide                                   |
| --------------------- | --------------------------------------- |
| Add new provider      | `contributing/add-new-provider.md`      |
| Add new model         | `contributing/add-new-model.md`         |
| Testing & fixtures    | `contributing/testing.md`               |
| Provider architecture | `contributing/provider-architecture.md` |
| Building new features | `contributing/building-new-features.md` |
| Codemods              | `contributing/codemods.md`              |

## Changesets

- **Required**: Every PR modifying production code needs a changeset
- **Default**: Use `patch` (non-breaking changes)
- **Command**: `pnpm changeset` in workspace root
- **Note**: Don't select example packages - they're not published

## Do Not

- Add minor/major changesets without maintainer approval
- Change public APIs without updating documentation
- Commit without running `pnpm prettier-fix`
- Use `require()` for Zod imports
- Add new dependencies without running `pnpm update-references`
