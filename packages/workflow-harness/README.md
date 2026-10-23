# Workflow Harness

Run an AI SDK `HarnessAgent` (Claude Code, Codex, Pi) as a **durable workflow**
using the [Workflow DevKit](https://www.npmjs.com/package/workflow). A turn can
be divided into time slices or semantic agent steps.

## Setup

```bash
npm i ai @ai-sdk/workflow-harness workflow @ai-sdk/harness @ai-sdk/harness-claude-code @ai-sdk/sandbox-vercel zod
```

## Usage

```ts
import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { steppedAgent } = await import('./stepped-agent');
  const {
    createVercelNetworkSandboxSession,
    resumeVercelNetworkSandboxSession,
  } = await import('@ai-sdk/sandbox-vercel');
  const sandboxId = `harness-${state.sessionId}`;
  const sandboxSession =
    state.resumeFrom == null && state.continueFrom == null
      ? await createVercelNetworkSandboxSession({
          sandboxId,
          runtime: 'node24',
          ports: [4000],
          template: await steppedAgent.getSandboxTemplate(),
        })
      : await resumeVercelNetworkSandboxSession({ sandboxId });

  return runHarnessAgentStep({ agent: steppedAgent, state, sandboxSession });
}
```

See the [Workflow Utilities documentation](https://ai-sdk.dev/docs/ai-sdk-harnesses/workflow-utilities) for more information.
