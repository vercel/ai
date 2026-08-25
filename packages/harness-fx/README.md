# AI SDK - fx Harness

The **[@ai-sdk/harness-fx](https://www.npmjs.com/package/@ai-sdk/harness-fx)** package adapts [fx](https://fx.sh) to the AI SDK harness abstraction through the Agent Client Protocol (ACP).

## Setup

```bash
npm install @ai-sdk/harness @ai-sdk/harness-fx @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { fx } from '@ai-sdk/harness-fx';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: fx,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
});

const session = await agent.createSession();

try {
  const result = await agent.generate({
    session,
    prompt: 'Inspect this project and summarize its purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
}
```

The adapter uses `@ai-sdk/harness-acp`, which installs the latest fx release inside the sandbox with the canonical fx installer. The sandbox must provide network access and at least one exposed TCP port.

fx uses Vercel AI Gateway. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` to authenticate, or pass an isolated authentication environment with `createFx({ auth: { AI_GATEWAY_API_KEY: token } })`.

See the [fx harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx) for settings, tools, and limitations.
