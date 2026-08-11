# AI SDK - DeepSeek Provider

The **[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [DeepSeek](https://www.deepseek.com) platform.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access DeepSeek (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The DeepSeek provider is available in the `@ai-sdk/deepseek` module. You can install it with

```bash
npm i @ai-sdk/deepseek
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `deepSeek` from `@ai-sdk/deepseek`:

```ts
import { deepSeek } from '@ai-sdk/deepseek';
```

The provider supports DeepSeek V4's current API models:

- `deepseek-v4-flash`: fast and cost-efficient
- `deepseek-v4-pro`: higher-capability reasoning and agentic tasks

Both models support thinking and non-thinking modes, a 1M-token context window,
and up to 384K output tokens.

The provider also supports:

- JSON output through AI SDK `Output` schemas
- Tool calls in thinking and non-thinking modes
- Beta strict tool schemas with a custom `https://api.deepseek.com/beta` base URL
- Automatic context caching with cache hit and miss usage metadata

## Example

```ts
import { deepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';

const { text, reasoning } = await generateText({
  model: deepSeek('deepseek-v4-pro'),
  prompt: 'How many "r"s are in the word "strawberry"?',
  providerOptions: {
    deepseek: {
      thinking: { type: 'enabled' },
      reasoningEffort: 'high',
    },
  },
});
```

DeepSeek V4 uses thinking mode by default. Set
`providerOptions.deepseek.thinking.type` to `disabled` to turn it off. In
thinking mode, DeepSeek ignores `temperature`, `topP`, `presencePenalty`, and
`frequencyPenalty`.

When a thinking-mode response contains a tool call, keep the complete assistant
response, including its reasoning parts, in subsequent conversation history.
DeepSeek requires this reasoning content and returns a `400` error when it is
missing.

DeepSeek's API is stateless. Preserve `responseMessages` from `generateText` or
`streamText` when building multi-turn conversations, especially across tool
calls.

> The legacy `deepseek-chat` and `deepseek-reasoner` aliases currently map to
> the non-thinking and thinking modes of `deepseek-v4-flash`, respectively.
> DeepSeek will retire both aliases on 2026-07-24 at 15:59 UTC.

## Documentation

Please check out the **[DeepSeek provider](https://ai-sdk.dev/providers/ai-sdk-providers/deepseek)** for more information.
