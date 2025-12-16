# AI SDK DevTools

A local development tool for debugging and inspecting AI SDK applications. View LLM requests, responses, tool calls, and multi-step interactions in a web-based UI.

> **Note**: This package is experimental and intended for local development only. Do not use in production environments.

## Installation

```bash
npm install @ai-sdk/devtools
# or
pnpm add @ai-sdk/devtools
```

## Requirements

- AI SDK v6 beta (`ai@^6.0.0-beta.0`)
- Node.js compatible runtime

## Usage

### 1. Add the middleware to your model

```typescript
import { wrapLanguageModel } from 'ai';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const model = wrapLanguageModel({
  middleware: devToolsMiddleware,
  model: yourModel,
});
```

### 2. Run the viewer

```bash
npx @ai-sdk/devtools
```

Open http://localhost:4983 to view your AI SDK interactions.

## Monorepo Usage

When using devtools in a monorepo, the viewer and your app may run from different directories. Use the `--data-dir` flag or environment variable to ensure they read/write to the same location:

### Option 1: Use the `--data-dir` flag

```bash
# Run from monorepo root, pointing to your app's data directory
npx @ai-sdk/devtools --data-dir ./apps/my-app/.devtools
```

### Option 2: Use the environment variable

Set `AI_SDK_DEVTOOLS_DATA_DIR` to an absolute path that both the middleware and viewer will use:

```bash
# In your app
AI_SDK_DEVTOOLS_DATA_DIR=/path/to/monorepo/apps/my-app/.devtools npm run dev

# When running the viewer
AI_SDK_DEVTOOLS_DATA_DIR=/path/to/monorepo/apps/my-app/.devtools npx @ai-sdk/devtools
```

### Option 3: Run the CLI from your app directory

```bash
cd apps/my-app
npx @ai-sdk/devtools
```

### Alternative command

You can also use `ai-sdk-devtools` as an alias:

```bash
npx ai-sdk-devtools --data-dir ./apps/my-app/.devtools
```

## How it works

The middleware intercepts all `generateText` and `streamText` calls, capturing:

- Input parameters and prompts
- Output content and tool calls
- Token usage and timing
- Raw provider request/response data

Data is stored locally in a JSON file (`.devtools/generations.json`) and served through a web UI.

### Data flow

```
AI SDK call → devToolsMiddleware → JSON file → Hono API → React UI
```

### Key concepts

- **Run**: A complete multi-step AI interaction, grouped by initial prompt
- **Step**: A single LLM call within a run

## Development

```bash
pnpm install
pnpm dev        # Start dev server at http://localhost:5173
```

## License

MIT
