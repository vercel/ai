# AI SDK - OpenAI Provider

The **[OpenAI provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)** for the [AI SDK](https://ai-sdk.dev/docs)
contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

> **Deploying to Vercel?** With Vercel's AI Gateway you can access OpenAI (and hundreds of models from other providers) — no additional packages, API keys, or extra cost. [Get started with AI Gateway](https://vercel.com/ai-gateway).

## Setup

The OpenAI provider is available in the `@ai-sdk/openai` module. You can install it with

```bash
npm i @ai-sdk/openai
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Provider Instance

You can import the default provider instance `openai` from `@ai-sdk/openai`:

```ts
import { openai } from '@ai-sdk/openai';
```

## Example

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

### Experimental realtime models

Use the same factory for OpenAI Realtime and Live models:

```ts
openai.experimental_realtime('gpt-realtime');
openai.experimental_realtime('gpt-live-1');
openai.experimental_realtime('not-yet-released', { api: 'live' });
```

Live supports browser WSS sessions through an application-owned relay and
`experimental_useRealtime`, with client delegation: your application owns the
agent and tools. Optional browser-direct WebRTC is also available. Start with the
[OpenAI provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/openai#realtime-models)
for connection settings, startup options, and event mapping.

The [`experimental_useRealtime` reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-realtime#continuous-conversations)
covers the JSON/PCM16 relay runtime, capture/playback controls, and application-handled
client delegation, plus `api.session` WebRTC setup and server-owned data-channel
permissions. Microphone capture requires browser permission; the application handles
client delegation and submits context on either transport. The
[Realtime guide](https://ai-sdk.dev/docs/ai-sdk-core/realtime) covers legacy token-based,
turn-based sessions.

Runtime and provider authors can consult the repository's
[realtime integration notes](../../architecture/realtime-provider-integration.md).
