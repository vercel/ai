import type { HarnessV1 } from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { jsonSchema, Output } from 'ai';
import { expectTypeOf, test } from 'vitest';
import {
  createHarnessWorkflowState,
  finalizeHarnessWorkflow,
} from './harness-workflow-state';
import { runHarnessAgentStep } from './run-harness-agent-step';

const harness = null as unknown as HarnessV1;
const agent = new HarnessAgent({
  harness,
  output: Output.object({
    schema: jsonSchema<{ score: number }>({
      type: 'object',
      properties: {
        score: { type: 'number' },
      },
      required: ['score'],
      additionalProperties: false,
    }),
  }),
});

test('infers structured output from the HarnessAgent', async () => {
  const state = await runHarnessAgentStep({
    agent,
    state: createHarnessWorkflowState({
      prompt: 'Score this.',
      sessionId: 'session-1',
    }),
    writable: null as unknown as WritableStream,
  });

  expectTypeOf(state.finalResult?.output).toEqualTypeOf<
    { score: number } | undefined
  >();

  const result = finalizeHarnessWorkflow(state);
  expectTypeOf(result.output).toEqualTypeOf<{ score: number } | undefined>();
});
