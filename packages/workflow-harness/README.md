# @ai-sdk/workflow-harness

Run an AI SDK `HarnessAgent` (Claude Code, Codex, Pi) as a **durable workflow**
using the [Workflow DevKit](https://www.npmjs.com/package/workflow).

A long agent turn is sliced into short, time-boxed steps so it survives a Fluid
Compute function recycle (~800s). Between slices the agent is frozen
non-destructively — the sandbox keeps running and the next slice reattaches to
the in-flight turn (`attach`) — and a serializable state object is persisted as
the durable step return value.

This package ships plain helpers + a serializable state machine; you own the
thin `'use workflow'` / `'use step'` wrappers (the Workflow DevKit compiles
those directives in your app):

```ts
import {
  createHarnessWorkflowState,
  runHarnessAgentSlice,
  finalizeHarnessWorkflow,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createVercelSandbox({ runtime: 'node24', ports: [4000] }),
});

export async function codingWorkflow(input: {
  prompt: string;
  sessionId: string;
}) {
  'use workflow';
  let state = createHarnessWorkflowState(input);
  while (state.status === 'running' || state.status === 'timed_out') {
    state = await slice(state);
  }
  return finalizeHarnessWorkflow(state);
}

async function slice(state: HarnessWorkflowState) {
  'use step';
  return runHarnessAgentSlice({ agent, state });
}
```

`runHarnessAgentSlice` defaults to a `750`s budget (Fluid Compute reconnects at
~800s; 750 leaves a buffer). Lower it for demos so the freeze/resume is
observable sooner.
