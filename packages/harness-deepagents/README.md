# AI SDK - Deep Agents Harness

A [HarnessV1](../harness) adapter that runs [Deep Agents](https://github.com/langchain-ai/deepagentsjs)
(LangChain's LangGraph-based agent harness) as a coding-agent runtime inside an
AI SDK sandbox.

-> **Note**: This package is experimental.

## Setup

```bash
npm i @ai-sdk/harness-deepagents @ai-sdk/harness @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelNetworkSandboxSession } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: deepAgents,
});
const sandboxSession = await createVercelNetworkSandboxSession({
  runtime: 'node24',
  ports: [4000],
  template: await agent.getSandboxTemplate(),
});
const session = await agent.createSession({ sandboxSession });
try {
  console.log(
    (await agent.generate({ session, prompt: 'Inspect this project.' })).text,
  );
} finally {
  await session.destroy();
  await sandboxSession.destroy();
}
```

See the [Deep Agents Harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/deepagents) for more information.
