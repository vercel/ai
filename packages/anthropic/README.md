# AI SDK - Anthropic Provider

The **[Anthropic provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Anthropic Messages API](https://docs.anthropic.com/claude/reference/messages_post).

## Setup

The Anthropic provider is available in the `@ai-sdk/anthropic` module. You can install it with

```
npm i @ai-sdk/anthropic
```

## Provider Instance

You can import the default provider instance `anthropic` from `@ai-sdk/anthropic`:

```ts
import { anthropic } from '@ai-sdk/anthropic';
```

## Example

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const { text } = await generateText({
  model: anthropic('claude-3-haiku-20240307'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Provider-Defined Tools

The Anthropic provider supports several provider-defined tools that enable Claude to perform specialized tasks:

- **Web Search** (`webSearch_20250305`): Search the web for real-time information
- **Web Fetch** (`webFetch_20250910`): Fetch and analyze content from web pages and PDFs
- **Code Execution** (`codeExecution_20250522`): Execute Python code in a sandboxed environment
- **Computer Use** (`computer_20241022`, `computer_20250124`): Control computer interfaces
- **Text Editor** (`textEditor_20241022`, `textEditor_20250124`, `textEditor_20250429`): Edit text files
- **Bash** (`bash_20241022`, `bash_20250124`): Execute shell commands

### Example with Web Fetch Tool

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

const { text } = await generateText({
  model: anthropic('claude-3-5-sonnet-20241022'),
  tools: {
    web_fetch: anthropic.tools.webFetch_20250910({
      maxUses: 3,
      allowedDomains: ['example.com'],
      citations: { enabled: true },
    }),
  },
  prompt: 'Fetch and summarize the content from https://example.com',
});
```

## Documentation

Please check out the **[Anthropic provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)** for more information.
