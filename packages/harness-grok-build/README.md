# AI SDK - Grok Build Harness

The **[@ai-sdk/harness-grok-build](https://www.npmjs.com/package/@ai-sdk/harness-grok-build)** package adapts [Grok Build](https://x.ai/cli) to the AI SDK harness abstraction through the Agent Client Protocol (ACP).

## Setup

```bash
npm install @ai-sdk/harness @ai-sdk/harness-grok-build @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: grokBuild,
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

The adapter uses `@ai-sdk/harness-acp`, which installs the pinned Grok Build CLI inside the sandbox. The sandbox must provide network access and at least one exposed TCP port.

Set `XAI_API_KEY` for direct authentication. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` to use AI Gateway instead, or pass an isolated authentication environment with `createGrokBuild({ auth: { AI_GATEWAY_API_KEY: token } })`.

See the [Grok Build harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/grok-build) for settings, tools, and limitations.
