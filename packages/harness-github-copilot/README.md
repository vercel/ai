# AI SDK - GitHub Copilot Harness

The **[@ai-sdk/harness-github-copilot](https://www.npmjs.com/package/@ai-sdk/harness-github-copilot)** package runs GitHub Copilot CLI through its Agent Client Protocol server and the AI SDK harness abstraction.

## Setup

```bash
npm install @ai-sdk/harness @ai-sdk/harness-github-copilot @ai-sdk/sandbox-vercel
```

## Usage

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { githubCopilot } from '@ai-sdk/harness-github-copilot';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: githubCopilot,
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

The adapter uses `@ai-sdk/harness-acp`, which installs the pinned GitHub Copilot CLI inside the sandbox. The sandbox must provide network access and at least one exposed TCP port.

Set one of `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` for direct authentication. Set `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` to use AI Gateway instead, or pass an isolated authentication environment with `createGitHubCopilot({ auth: { AI_GATEWAY_API_KEY: token } })`.

See the [GitHub Copilot harness documentation](https://ai-sdk.dev/providers/ai-sdk-harnesses/github-copilot) for authentication security, settings, tools, and lifecycle support.
