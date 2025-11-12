# AI SDK - MiniMax Provider

The **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [MiniMax](https://www.minimaxi.com) platform.

## Available Models

- **MiniMax-M2**: Agentic capabilities, Advanced reasoning
- **MiniMax-M2-Stable**: High concurrency and commercial use

Both models share the same API interface and usage patterns.

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
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

Or explicitly:

```ts
import { minimaxAnthropic } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimaxAnthropic('MiniMax-M2'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

### OpenAI-Compatible API

```ts
import { minimaxOpenAI } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimaxOpenAI('MiniMax-M2'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

### Using MiniMax-M2-Stable

```ts
import { minimax } from '@ai-sdk/minimax';
import { generateText } from 'ai';

const { text } = await generateText({
  model: minimax('MiniMax-M2-Stable'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

Please check out the **[MiniMax provider](https://ai-sdk.dev/providers/ai-sdk-providers/minimax)** for more information.

