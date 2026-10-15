# @ai-sdk/workflow-harness

Run an AI SDK `HarnessAgent` (Claude Code, Codex, Pi) as a **durable workflow**
using the [Workflow DevKit](https://www.npmjs.com/package/workflow). A turn can
be divided into time slices or semantic agent steps.

Time slices let a long agent turn survive a Fluid Compute function recycle
(~800s). Semantic steps let a workflow persist after each agent step, typically
by configuring the agent with `stopWhen: isStepCount(1)`. At either boundary the
agent is frozen non-destructively and a serializable state object is persisted
as the durable step return value.

This package ships plain helpers + a serializable state machine; you own the
thin `'use workflow'` / `'use step'` wrappers (the Workflow DevKit compiles
those directives in your app).

Keep the Workflow DevKit entrypoints separate from the agent definition. The
workflow module should import only workflow-safe code plus step modules. The
step module should dynamically import the agent inside the `'use step'` body so
the agent, sandbox adapter, and other Node-heavy dependencies stay out of the
compiled workflow bundle.

`agent.ts`:

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';

export const agent = new HarnessAgent({ harness: claudeCode });
```

`time-slice-step.ts`:

```ts
import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function timeSliceStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { agent } = await import('./agent');
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
          template: await agent.getSandboxTemplate(),
        })
      : await resumeVercelNetworkSandboxSession({ sandboxId });

  return runHarnessAgentTimeSlice({ agent, state, sandboxSession });
}
```

`workflow.ts`:

```ts
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';
import { timeSliceStep } from './time-slice-step';

export async function timeSliceWorkflow(input: {
  prompt: HarnessWorkflowInput['prompt'];
  sessionId: string;
}) {
  'use workflow';

  let state = createHarnessWorkflowState(input);
  do {
    state = await timeSliceStep(state);
  } while (state.status === 'ready_for_next_step');
  return finalizeHarnessWorkflow(state);
}
```

For a semantic stepped workflow, configure the agent with
`stopWhen: isStepCount(1)`, call `runHarnessAgentStep()` from the step module,
and continue while the status is `ready_for_next_step`:

`stepped-agent.ts`:

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { isStepCount } from 'ai';

export const steppedAgent = new HarnessAgent({
  harness: claudeCode,
  stopWhen: isStepCount(1),
});
```

`stepped-agent-step.ts`:

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

`stepped-workflow.ts`:

```ts
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';
import { agentStep } from './stepped-agent-step';

export async function agentWorkflow(
  input: Pick<HarnessWorkflowInput, 'messages' | 'sessionId'>,
) {
  'use workflow';

  let state = createHarnessWorkflowState(input);
  do {
    state = await agentStep(state);
  } while (state.status === 'ready_for_next_step');
  return finalizeHarnessWorkflow(state);
}
```

`route.ts` (Next.js example):

```ts
import { start } from 'workflow/api';
import { timeSliceWorkflow } from './workflow';

export async function POST(request: Request) {
  const body = (await request.json()) as {
    prompt: string;
    sessionId: string;
  };
  const run = await start(timeSliceWorkflow, [body]);

  return new Response(run.readable);
}
```
