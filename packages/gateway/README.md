# AI SDK - Gateway Provider

The Gateway provider for the [AI SDK](https://ai-sdk.dev/docs) allows the use of a wide variety of AI models and providers.

## Setup

```bash
npm i ai @ai-sdk/gateway
```

## Authentication

The provider picks a credential for each request in this order:

1. The `apiKey` option passed to `createGateway`.
2. The `AI_GATEWAY_API_KEY` environment variable.
3. The Vercel OIDC token.

On Vercel deployments, the OIDC token is available automatically, so you don't need an API key or any environment variable. For local development, link the project with `vercel link`, then run `vercel env pull` to get an OIDC token (it expires after 12 hours) or use `vercel dev`, which refreshes it for you.

If an API key is set, the provider always uses it instead of OIDC, even when the key is invalid.

The full provider documentation ships with this package in `docs/00-ai-gateway.mdx`.

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
