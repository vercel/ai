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
  middleware: devToolsMiddleware(),
  model: yourModel,
});
```

### 2. Run the viewer

```bash
npx @ai-sdk/devtools
```

Open http://localhost:4983 to view your AI SDK interactions.

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
