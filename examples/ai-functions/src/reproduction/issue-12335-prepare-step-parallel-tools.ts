import { createVertex } from '@ai-sdk/google-vertex';
import { stepCountIs, streamText, tool } from 'ai';
import assert from 'node:assert/strict';
import { z } from 'zod';

const usageMetadata = {
  promptTokenCount: 10,
  candidatesTokenCount: 5,
  totalTokenCount: 15,
};

function streamResponse(parts: Array<Record<string, unknown>>) {
  return new Response(
    `data: ${JSON.stringify({
      candidates: [
        {
          content: { role: 'model', parts },
          finishReason: 'STOP',
          index: 0,
        },
      ],
      usageMetadata,
      modelVersion: 'gemini-3-flash-preview',
    })}\n\n`,
    {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    },
  );
}

async function main() {
  const requestToolChoices: unknown[] = [];
  let defaultChoiceCalls = 0;
  let generatedToolCallId = 0;
  let summaryExecutions = 0;
  const prepareStepNumbers: number[] = [];

  const vertex = createVertex({
    apiKey: 'reproduction-api-key',
    generateId: () => `generated-call-${++generatedToolCallId}`,
    fetch: async (_url, init) => {
      if (typeof init?.body !== 'string') {
        throw new Error('Expected the Vertex request body to be a string');
      }
      const body = JSON.parse(init.body);
      const functionCallingConfig =
        body.toolConfig?.functionCallingConfig ?? null;
      requestToolChoices.push(functionCallingConfig);

      const forcedSummary =
        functionCallingConfig?.mode === 'ANY' &&
        functionCallingConfig?.allowedFunctionNames?.length === 1 &&
        functionCallingConfig.allowedFunctionNames[0] === 'stepSummary';

      if (forcedSummary) {
        return streamResponse([
          {
            functionCall: {
              name: 'stepSummary',
              args: { summary: 'Completed work; continue normally.' },
            },
            thoughtSignature: 'summary-signature',
          },
        ]);
      }

      defaultChoiceCalls++;

      if (defaultChoiceCalls === 1) {
        return streamResponse(
          Array.from({ length: 6 }, (_, index) => ({
            functionCall: {
              name: 'lookup',
              args: { item: `item-${index + 1}` },
            },
            ...(index === 0
              ? { thoughtSignature: 'parallel-batch-signature' }
              : {}),
          })),
        );
      }

      if (defaultChoiceCalls === 2) {
        return streamResponse([
          {
            functionCall: {
              name: 'continueWork',
              args: { task: 'prepare for the summary step' },
            },
            thoughtSignature: 'continue-work-signature',
          },
        ]);
      }

      if (defaultChoiceCalls === 3) {
        return streamResponse([{ text: 'Finished after one summary.' }]);
      }

      throw new Error(
        `Unexpected extra unforced model call ${defaultChoiceCalls}`,
      );
    },
  });

  const result = streamText({
    model: vertex('gemini-3-flash-preview'),
    prompt: 'Perform several lookups in parallel, then finish the task.',
    tools: {
      lookup: tool({
        inputSchema: z.object({ item: z.string() }),
        execute: async ({ item }) => ({ item, found: true }),
      }),
      continueWork: tool({
        inputSchema: z.object({ task: z.string() }),
        execute: async ({ task }) => ({ task, continued: true }),
      }),
      stepSummary: tool({
        inputSchema: z.object({ summary: z.string() }),
        execute: async () => {
          summaryExecutions++;
          return 'Summary complete, please continue with next steps';
        },
      }),
    },
    stopWhen: stepCountIs(20),
    timeout: { totalMs: 5_000 },
    prepareStep: async ({ stepNumber }) => {
      prepareStepNumbers.push(stepNumber);
      if (stepNumber > 0 && (stepNumber + 1) % 3 === 0) {
        return {
          toolChoice: {
            type: 'tool' as const,
            toolName: 'stepSummary' as const,
          },
        };
      }
      return undefined;
    },
  });

  await result.consumeStream();
  const steps = await result.steps;

  assert.equal(
    steps[0]?.toolCalls.length,
    6,
    'The first step did not contain six parallel tool calls',
  );
  assert.deepEqual(
    prepareStepNumbers,
    [0, 1, 2, 3],
    `prepareStep did not advance exactly once per completed step: ${JSON.stringify(prepareStepNumbers)}`,
  );
  assert.equal(
    summaryExecutions,
    1,
    `stepSummary executed ${summaryExecutions} times instead of once`,
  );
  assert.deepEqual(
    steps[2]?.toolCalls.map(call => call.toolName),
    ['stepSummary'],
    'The forced step did not contain exactly one stepSummary call',
  );
  assert.equal(
    steps[3]?.text,
    'Finished after one summary.',
    'The model did not continue normally after the forced summary step',
  );
  assert.equal(steps.length, 4, 'The stream did not finish after four steps');
  assert.equal(
    (requestToolChoices[2] as { mode?: string })?.mode,
    'ANY',
    'The summary request was not sent as a forced function call',
  );
  assert.notEqual(
    (requestToolChoices[3] as { allowedFunctionNames?: string[] })
      ?.allowedFunctionNames?.[0],
    'stepSummary',
    'The forced stepSummary choice leaked into the following step',
  );

  console.log(
    'Issue #12335 not reproduced: six parallel tool calls were followed by one forced stepSummary call and normal completion.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
