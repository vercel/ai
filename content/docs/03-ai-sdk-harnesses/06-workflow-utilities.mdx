---
title: Workflow Utilities
description: Run HarnessAgent turns as durable Workflow DevKit workflows.
---

# Workflow Utilities

`@ai-sdk/workflow-harness` provides helpers for running `HarnessAgent` turns
inside a [workflow](https://vercel.com/docs/workflow).

The package provides a serializable state machine and runners for time-sliced
and semantic agent step turns. You call the appropriate runner from your own
`'use workflow'` and `'use step'` functions.

The core harness and workflow files are framework-independent. The HTTP handlers
shown below use Next.js as one example; adapt them to your runtime and Workflow
SDK integration. If you use Next.js, ensure you have
[configured your project for Workflow](https://workflow-sdk.dev/docs/getting-started/next)
before following the examples.

## Installation

<InstallPackages packages="@ai-sdk/workflow-harness workflow" />

In addition to the workflow specific packages, install the core harness package,
a harness adapter, and a sandbox provider as shown in
[HarnessAgent](/docs/ai-sdk-harnesses/harness-agent).

## Configuring the Harness Agent

The agent can be configured in the usual way, for the most part. When using
semantic agent steps, set `stopWhen` to `isStepCount(1)` so one call to
`stream()` completes one agent step. Omit it when using time slices.

```ts filename='harness-workflow/agent.ts' highlight="13-17"
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { isStepCount } from 'ai';

export const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  instructions: 'You are a helpful coding assistant.',
  /*
   * Only needed for semantic agent-step workflows.
   * Omit this for time-sliced workflows.
   */
  stopWhen: isStepCount(1),
});
```

## Using Semantic Agent Steps

Semantic agent steps persist the harness turn after each agent step. Configure
the shared agent with the highlighted `stopWhen` option shown above, then call
`runHarnessAgentStep()` from a Workflow step.

### Defining the Agent Step

Keep the Workflow step in its own module and import the agent dynamically inside
the step body. This keeps the agent, sandbox provider, and other Node.js
dependencies out of the workflow bundle.

```ts filename='harness-workflow/agent-step.ts'
import {
  runHarnessAgentStep,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function agentStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { agent } = await import('./agent');

  return runHarnessAgentStep({
    agent,
    state,
  });
}
```

### Defining the Semantic Agent Step Workflow

Create the workflow state and keep scheduling `agentStep()` while the agent has
more work.

```ts filename='harness-workflow/workflow.ts'
import { agentStep } from './agent-step';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';

export async function agentWorkflow(input: {
  messages: NonNullable<HarnessWorkflowInput['messages']>;
  sessionId: string;
}) {
  'use workflow';

  let state = createHarnessWorkflowState(input);

  do {
    state = await agentStep(state);
  } while (state.status === 'ready_for_next_step');

  return finalizeHarnessWorkflow(state);
}
```

<Note>
  This example covers the workflow execution foundation only. For multi-turn
  conversations, you must persist the harness session's `resumeFrom` state
  between workflow runs. See [Resume Persistence](#resume-persistence).
</Note>

Each `ready_for_next_step` result carries `continueFrom`, which lets the next
Workflow step continue the same unfinished turn. When the turn finishes,
`finalizeHarnessWorkflow()` returns its result or throws if the workflow failed.

### Starting the Semantic Agent Step Workflow

Start the workflow from server-side code. This Next.js route converts the AI SDK
UI messages, starts `agentWorkflow()`, and returns the workflow's AI SDK UI
message stream. Passing the converted messages lets `HarnessAgent` distinguish a
new user turn from tool approval and tool result continuations.

```ts filename='app/api/harness-workflow/route.ts'
import { agentWorkflow } from '../../../harness-workflow/workflow';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { start } from 'workflow/api';

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat ID', { status: 400 });
  }

  const messages = await convertToModelMessages(body.messages);
  const run = await start(agentWorkflow, [
    {
      messages,
      sessionId: body.id,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable as ReadableStream<UIMessageChunk>,
  });
}
```

The `sessionId` gives the sandbox a stable identity across workflow runs. Keep
`agent.ts`, `agent-step.ts`, `workflow.ts`, and the route in separate modules so
the workflow bundle does not include Node-heavy agent, sandbox, or framework
dependencies.

## Using Time Slices

Time slices persist a long-running harness turn at wall-clock boundaries. Omit
the highlighted `stopWhen` option from the shared agent, then call
`runHarnessAgentTimeSlice()` from a Workflow step. It uses a 750-second budget
by default; pass `timeSliceSeconds` to choose a different budget.

### Defining the Time Slice Step

As with semantic agent steps, keep the Workflow step in its own module and
import the agent dynamically inside the step body.

```ts filename='harness-workflow/time-slice-step.ts'
import {
  runHarnessAgentTimeSlice,
  type HarnessWorkflowState,
} from '@ai-sdk/workflow-harness';

export async function timeSliceStep(
  state: HarnessWorkflowState,
): Promise<HarnessWorkflowState> {
  'use step';

  const { agent } = await import('./agent');

  return runHarnessAgentTimeSlice({
    agent,
    state,
  });
}
```

### Defining the Time-Sliced Workflow

Create the workflow state and keep scheduling `timeSliceStep()` while the agent
has more work.

```ts filename='harness-workflow/workflow.ts'
import { timeSliceStep } from './time-slice-step';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';

export async function timeSliceWorkflow(input: {
  messages: NonNullable<HarnessWorkflowInput['messages']>;
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

<Note>
  This example covers the workflow execution foundation only. For multi-turn
  conversations, you must persist the harness session's `resumeFrom` state
  between workflow runs. See [Resume Persistence](#resume-persistence).
</Note>

Each `ready_for_next_step` result carries `continueFrom`, which lets the next
Workflow step continue the same unfinished turn. When the turn finishes,
`finalizeHarnessWorkflow()` returns its result or throws if the workflow failed.

### Starting the Time-Sliced Workflow

Start the workflow from server-side code. As with semantic agent steps, pass the
converted messages so `HarnessAgent` can distinguish a new user turn from tool
approval and tool result continuations.

```ts filename='app/api/harness-workflow/route.ts'
import { timeSliceWorkflow } from '../../../harness-workflow/workflow';
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  type UIMessage,
  type UIMessageChunk,
} from 'ai';
import { start } from 'workflow/api';

export async function POST(request: Request) {
  const body: {
    id?: string;
    messages: UIMessage[];
  } = await request.json();

  if (!body.id) {
    return new Response('Missing chat ID', { status: 400 });
  }

  const messages = await convertToModelMessages(body.messages);
  const run = await start(timeSliceWorkflow, [
    {
      messages,
      sessionId: body.id,
    },
  ]);

  return createUIMessageStreamResponse({
    stream: run.readable as ReadableStream<UIMessageChunk>,
  });
}
```

The `sessionId` gives the sandbox a stable identity across workflow runs. Keep
`agent.ts`, `time-slice-step.ts`, `workflow.ts`, and the route in separate
modules so the workflow bundle does not include Node-heavy agent, sandbox, or
framework dependencies.

## Resume Persistence

Workflow automatically persists the `HarnessWorkflowState` returned by each
step, including `continueFrom`, for the duration of the current workflow run.
To continue the native harness session across separate user-turn workflow runs,
persist the opaque `resumeFrom` state by `sessionId`.

The storage implementation is the same for semantic agent steps and time
slices. This example uses Workflow steps because filesystem access must stay out
of the workflow function itself. Use durable storage instead of local files in
production.

```ts filename='harness-workflow/resume-store.ts'
import type { HarnessV1ResumeSessionState } from '@ai-sdk/harness';
import { safeParseJSON } from '@ai-sdk/provider-utils';

const RESUME_DIR = '.harness-sessions';

function fileName(sessionId: string): string {
  return `${sessionId.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
}

export async function loadResumeStep(
  sessionId: string,
): Promise<HarnessV1ResumeSessionState | undefined> {
  'use step';

  const { readFile } = await import('node:fs/promises');
  const { join } = await import('node:path');

  let text: string;
  try {
    text = await readFile(
      join(process.cwd(), RESUME_DIR, fileName(sessionId)),
      'utf8',
    );
  } catch {
    return undefined;
  }

  const parsed = await safeParseJSON({ text });

  return parsed.success
    ? (parsed.value as unknown as HarnessV1ResumeSessionState)
    : undefined;
}

export async function persistResumeStep({
  sessionId,
  resumeState,
}: {
  sessionId: string;
  resumeState: HarnessV1ResumeSessionState | undefined;
}): Promise<void> {
  'use step';

  if (!resumeState) return;

  const { mkdir, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const dir = join(process.cwd(), RESUME_DIR);

  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName(sessionId)), JSON.stringify(resumeState));
}
```

Load the previous `resumeFrom` state before creating the workflow state, then
persist the updated value after the execution loop. The integration points are
the same for both workflow approaches.

### Semantic Agent Step Workflow

```ts filename='harness-workflow/workflow.ts'
import { agentStep } from './agent-step';
import { loadResumeStep, persistResumeStep } from './resume-store';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';

export async function agentWorkflow(input: {
  messages: NonNullable<HarnessWorkflowInput['messages']>;
  sessionId: string;
}) {
  'use workflow';

  const resumeFrom = await loadResumeStep(input.sessionId);
  let state = createHarnessWorkflowState({ ...input, resumeFrom });

  do {
    state = await agentStep(state);
  } while (state.status === 'ready_for_next_step');

  await persistResumeStep({
    sessionId: state.sessionId,
    resumeState: state.resumeFrom,
  });

  return finalizeHarnessWorkflow(state);
}
```

### Time-Sliced Workflow

```ts filename='harness-workflow/workflow.ts'
import { loadResumeStep, persistResumeStep } from './resume-store';
import { timeSliceStep } from './time-slice-step';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
  type HarnessWorkflowInput,
} from '@ai-sdk/workflow-harness';

export async function timeSliceWorkflow(input: {
  messages: NonNullable<HarnessWorkflowInput['messages']>;
  sessionId: string;
}) {
  'use workflow';

  const resumeFrom = await loadResumeStep(input.sessionId);
  let state = createHarnessWorkflowState({ ...input, resumeFrom });

  do {
    state = await timeSliceStep(state);
  } while (state.status === 'ready_for_next_step');

  await persistResumeStep({
    sessionId: state.sessionId,
    resumeState: state.resumeFrom,
  });

  return finalizeHarnessWorkflow(state);
}
```

## Related

- [HarnessAgent](/docs/ai-sdk-harnesses/harness-agent)
- [Harness adapters](/docs/ai-sdk-harnesses/harness-adapters)
- [UI](/docs/ai-sdk-harnesses/ui)
