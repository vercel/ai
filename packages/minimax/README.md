# AI SDK - MiniMax Provider

The **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [MiniMax](https://www.minimaxi.com) platform.

## Setup

The MiniMax provider is available in the `@ai-sdk/minimax` module. You can install it with

```bash
npm i @ai-sdk/minimax
```

## Provider Instance

You can import the default provider instance `minimax` from `@ai-sdk/minimax`:

```ts
import { minimax } from '@ai-sdk/minimax';
```

> **Note**: The default `minimax` instance uses the Anthropic-compatible API format, which provides better support for advanced features. If you need the OpenAI-compatible format, use `minimaxOpenAI` instead.

## Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('MiniMax-M2'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## API Compatibility

MiniMax provides two API compatibility modes, both included in this package:

### Anthropic-Compatible API (Default)

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('MiniMax-M2'),
  prompt: 'Hello!',
});
```

Or explicitly:

```ts
import { minimaxAnthropic } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimaxAnthropic('MiniMax-M2'),
  prompt: 'Hello!',
});
```

### OpenAI-Compatible API

```ts
import { minimaxOpenAI } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimaxOpenAI('MiniMax-M2'),
  prompt: 'Hello!',
});
```

### Custom Configuration

You can create custom provider instances with specific settings:

```ts
import { createMinimax, createMinimaxOpenAI } from '@ai-sdk/minimax';

// Anthropic-compatible with custom settings (default)
const customAnthropic = createMinimax({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/anthropic/v1', // optional, this is the default
  headers: {
    'Custom-Header': 'value',
  },
});

// OpenAI-compatible with custom settings
const customOpenAI = createMinimaxOpenAI({
  apiKey: process.env.MINIMAX_API_KEY,
  baseURL: 'https://api.minimax.io/v1', // optional, this is the default
  headers: {
    'Custom-Header': 'value',
  },
});
```

## Configuration Options

Both `createMinimax` (Anthropic-compatible) and `createMinimaxOpenAI` (OpenAI-compatible) accept the following options:

- **apiKey** _string_

  API key for authenticating with the MiniMax API. Defaults to the `MINIMAX_API_KEY` environment variable.

- **baseURL** _string_

  Custom base URL for API calls.
  - Anthropic-compatible default: `https://api.minimax.io/anthropic/v1`
  - OpenAI-compatible default: `https://api.minimax.io/v1`

- **headers** _Record<string, string>_

  Custom headers to include in API requests.

- **fetch** _(input: RequestInfo, init?: RequestInit) => Promise<Response>_

  Custom fetch implementation for intercepting requests or testing.

## Streaming Example

```ts
import { minimax } from '@ai-sdk/minimax';
import { streamText } from 'ai';

const result = streamText({
  model: minimax('MiniMax-M2'),
  prompt: 'Write a short story about a robot.',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

## Exports

This package exports the following:

- **Functions**: 
  - `createMinimax` (Anthropic-compatible, default)
  - `minimax` (Anthropic-compatible, default)
  - `minimaxAnthropic` (Anthropic-compatible)
  - `createMinimaxOpenAI` (OpenAI-compatible)
  - `minimaxOpenAI` (OpenAI-compatible)
- **Types**: 
  - `MinimaxProvider` (Anthropic-compatible)
  - `MinimaxProviderSettings` (Anthropic-compatible)
  - `MinimaxAnthropicProvider`
  - `MinimaxAnthropicProviderSettings`
  - `MinimaxOpenAIProvider`
  - `MinimaxOpenAIProviderSettings`
  - `MinimaxErrorData`

## Documentation

Please check out the **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for more information.

