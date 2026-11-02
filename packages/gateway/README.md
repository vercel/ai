# AI SDK - Gateway Provider

The Gateway provider for the [AI SDK](https://ai-sdk.dev/docs) allows the use of a wide variety of AI models and providers.

## Setup

```bash
npm i ai @ai-sdk/gateway
```

## Skill for Coding Agents

If you use coding agents such as Claude Code or Cursor, we highly recommend adding the AI SDK skill to your repository:

```shell
npx skills add vercel/ai
```

## Usage

```ts
import { gateway } from '@ai-sdk/gateway';
import { generateText } from 'ai';

const { text } = await generateText({
  model: gateway('spacexai/grok-4.7'),
  prompt:
    'Tell me about the history of the San Francisco Mission-style burrito.',
});
```

See the [Gateway Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway) for more information.
