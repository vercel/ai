# AI SDK - fx Harness

The **[@ai-sdk/harness-fx](https://www.npmjs.com/package/@ai-sdk/harness-fx)** package adapts [fx](https://fx.sh) to the AI SDK harness abstraction using [libfx](https://www.npmjs.com/package/libfx). The runtime runs on the host, while built-in filesystem and shell tools operate exclusively on the sandbox.

## Setup

```bash
npm install @ai-sdk/harness @ai-sdk/harness-fx @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { fx } from '@ai-sdk/harness-fx';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: fx,
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  template: await agent.getSandboxTemplate(),
});
const session = await agent.createSession({ sandboxSession });

try {
  const result = await agent.generate({
    session,
    prompt: 'Inspect this project and summarize its purpose.',
  });
  console.log(result.text);
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

No fx executable or bridge is installed inside the sandbox, and no exposed sandbox port is required. Model requests run on the host.

fx uses Vercel AI Gateway. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` to authenticate, or pass an isolated authentication environment with `createFx({ auth: { AI_GATEWAY_API_KEY: token } })`.

See the [fx harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx) for settings, tools, and limitations.
