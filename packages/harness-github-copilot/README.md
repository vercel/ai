# AI SDK - GitHub Copilot Harness

The **[@ai-sdk/harness-github-copilot](https://www.npmjs.com/package/@ai-sdk/harness-github-copilot)** package runs GitHub Copilot CLI through its Agent Client Protocol server and the AI SDK harness abstraction.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-github-copilot @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { githubCopilot } from '@ai-sdk/harness-github-copilot';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: githubCopilot,
});

const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  ports: [4000],
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

See the [GitHub Copilot Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/github-copilot) for more information.
