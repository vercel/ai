---
title: DevTools
description: Debug and inspect AI SDK applications with DevTools
---

# DevTools

<Note type="warning">
  AI SDK DevTools is intended for local development only. Do not use in
  production environments.
</Note>

AI SDK DevTools gives you full visibility over your AI SDK calls with [`generateText`](/docs/reference/ai-sdk-core/generate-text), [`streamText`](/docs/reference/ai-sdk-core/stream-text), and [`ToolLoopAgent`](/docs/reference/ai-sdk-core/tool-loop-agent). It helps you debug and inspect LLM requests, responses, tool calls, and multi-step interactions through a web-based UI.

DevTools is composed of two parts:

1. **Telemetry Integration**: Captures runs and steps from your AI SDK calls via the [telemetry](/docs/ai-sdk-core/telemetry) system
2. **Viewer**: A web UI to inspect the captured data

## Installation

Install the DevTools package:

```bash
pnpm add @ai-sdk/devtools
```

## Requirements

- AI SDK v7 (`ai@latest`)
- Node.js compatible runtime

## Using DevTools

### Register the integration

Register `DevToolsTelemetry` globally so it captures all AI SDK calls:

```ts
import { registerTelemetry } from 'ai';
import { DevToolsTelemetry } from '@ai-sdk/devtools';

registerTelemetry(DevToolsTelemetry());
```

Telemetry is enabled automatically once an integration is registered — no per-call configuration is needed:

```ts
import { generateText } from 'ai';

const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'What cities are in the United States?',
});
```

You can also pass the integration to individual calls instead of registering it globally:

```ts highlight="7-9"
import { streamText } from 'ai';
import { DevToolsTelemetry } from '@ai-sdk/devtools';

const result = streamText({
  model: openai('gpt-4o'),
  prompt: 'Hello!',
  telemetry: {
    integrations: [DevToolsTelemetry()],
  },
});
```

### Launch the viewer

Start the DevTools viewer:

```bash
npx @ai-sdk/devtools@latest
```

Open [http://localhost:4983](http://localhost:4983) to view your AI SDK interactions.

### Choose a viewer theme

The viewer uses the dark theme by default. Use the theme button in the viewer
header to switch between dark and light themes. Your selection is stored in
your browser and restored the next time you open the viewer at the same origin.

### Monorepo usage

If you are using a monorepo setup (e.g. Turborepo, Nx), start DevTools from the same workspace where your AI SDK code runs.

For example, if your API is in `apps/api`, run:

```bash
cd apps/api
npx @ai-sdk/devtools@latest
```

The explicit `@latest` tag ensures that `npx` installs an executable copy
instead of selecting a transitive dependency whose binary is not linked into
the workspace.

## Captured data

DevTools captures the following information from your AI SDK calls:

- **Input parameters and prompts**: View the complete input sent to your LLM
- **Output content and tool calls**: Inspect generated text, tool invocations, and tool results
- **Media previews**: View images, audio, and video included in prompts, tool inputs, and tool outputs
- **Token usage and timing**: Monitor resource consumption and performance
- **Raw provider data**: Access provider request and response payloads when body retention is enabled

### Media previews

DevTools recognizes current `file` content parts as well as the deprecated
`image-*`, `file-*`, and `media` tool-result aliases. Inline image, audio, and
video data is previewed directly, while the captured JSON shape and metadata
remain available for inspection. The viewer displays at most 8 previews per
value, traverses at most 12 nested levels, and embeds inline previews up to 5
MiB. Longer JSON strings are truncated in the viewer to avoid duplicating large
base64 payloads. Binary values in recognized media-bearing fields are persisted
as base64 so they remain previewable; unrelated binary values retain their
normal JSON representation.

For example, a tool can return media through `toModelOutput`:

```ts
import { tool } from 'ai';
import { z } from 'zod';

const captureScreenshot = tool({
  inputSchema: z.object({}),
  execute: async () => ({
    base64: await captureScreenshotAsBase64(),
  }),
  toModelOutput: ({ output }) => ({
    type: 'content',
    value: [
      {
        type: 'file',
        filename: 'screenshot.png',
        mediaType: 'image/png',
        data: { type: 'data', data: output.base64 },
      },
    ],
  }),
});
```

Remote `http` and `https` media is not loaded automatically. Select **Load
preview** in the viewer to fetch it with anonymous CORS and no referrer.
Cross-origin browser credentials are omitted, but same-origin browser
credentials may still be included by the browser. URLs containing embedded
usernames or passwords are rejected. Unsupported media, provider references,
malformed values, unsafe URL schemes, and inline values over the preview limit
retain their JSON and metadata fallback without an embedded preview.

Telemetry is enabled automatically, but AI SDK 7 excludes raw request and response bodies from step results by default. To make them available to DevTools for `generateText`, enable body retention on the call:

```ts highlight="4-7"
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello!',
  include: {
    requestBody: true,
    responseBody: true,
  },
});
```

`ToolLoopAgent` accepts the same `include` setting in its constructor. For `streamText` and `ToolLoopAgent.stream()`, only the request body can be retained; use `include: { requestBody: true }`.

### Runs and steps

DevTools organizes captured data into runs and steps:

- **Run**: A complete multi-step AI interaction, grouped by the initial prompt
- **Step**: A single LLM call within a run (e.g., one `generateText` or `streamText` call)

Multi-step interactions, such as those created by tool calling or agent loops, are grouped together as a single run with multiple steps. Nested sub-agent calls are linked to their parent run, making it easy to trace the full execution tree.

## How it works

The `DevToolsTelemetry` integration hooks into the AI SDK [telemetry](/docs/ai-sdk-core/telemetry) lifecycle to capture all `generateText`, `streamText`, `generateObject`, and `streamObject` calls. Captured data is stored locally in a JSON file (`.devtools/generations.json`) and served through a web UI built with Hono and React.

<Note type="warning">
  The integration automatically adds `.devtools` to your `.gitignore` file.
  Verify that `.devtools` is in your `.gitignore` to ensure you don't commit
  sensitive AI interaction data to your repository.
</Note>

## Security considerations

DevTools stores all AI interactions locally in plain text files, including:

- User prompts and messages
- LLM responses
- Tool call arguments and results
- API request and response data when body retention is enabled

**Only use DevTools in local development environments.** Do not enable DevTools in production or when handling sensitive data.
