import { dynamicTool, stepCountIs, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

async function main() {
  let step = 0;
  let capturedFinishEvent: unknown;

  const result = streamText({
    model: new MockLanguageModelV3({
      doStream: async () => {
        step++;

        return {
          stream:
            step === 1
              ? convertArrayToReadableStream([
                  {
                    type: 'tool-call',
                    toolCallId: 'call-list-my-issues',
                    toolName: 'list_my_issues',
                    input: JSON.stringify({
                      limit: 5,
                      orderBy: 'updatedAt',
                    }),
                  },
                  {
                    type: 'finish',
                    finishReason: {
                      unified: 'tool-calls',
                      raw: 'tool-calls',
                    },
                    usage: {
                      inputTokens: {
                        total: 10,
                        noCache: 10,
                        cacheRead: 0,
                        cacheWrite: 0,
                      },
                      outputTokens: {
                        total: 5,
                        text: 5,
                        reasoning: 0,
                      },
                    },
                  },
                ])
              : convertArrayToReadableStream([
                  { type: 'text-start', id: 'text-1' },
                  {
                    type: 'text-delta',
                    id: 'text-1',
                    delta: 'Here are your latest Linear issues.',
                  },
                  { type: 'text-end', id: 'text-1' },
                  {
                    type: 'finish',
                    finishReason: { unified: 'stop', raw: 'stop' },
                    usage: {
                      inputTokens: {
                        total: 20,
                        noCache: 20,
                        cacheRead: 0,
                        cacheWrite: 0,
                      },
                      outputTokens: {
                        total: 8,
                        text: 8,
                        reasoning: 0,
                      },
                    },
                  },
                ]),
        };
      },
    }),
    prompt: 'Fetch my five latest Linear issues.',
    tools: {
      list_my_issues: dynamicTool({
        inputSchema: z.object({
          limit: z.number(),
          orderBy: z.string(),
        }),
        execute: async input => ({
          issues: [{ id: 'issue-1', title: 'Reproduce issue #8578' }],
          input,
        }),
      }),
    },
    stopWhen: stepCountIs(2),
    onFinish: event => {
      capturedFinishEvent = event;
    },
  });

  await result.consumeStream();

  const finishEvent = capturedFinishEvent as
    | {
        steps: Array<{
          toolCalls: Array<{ toolCallId: string }>;
          toolResults: Array<{ toolCallId: string }>;
        }>;
        toolCalls: Array<{ toolCallId: string }>;
        dynamicToolCalls: Array<{ toolCallId: string }>;
        toolResults: Array<{ toolCallId: string }>;
        dynamicToolResults: Array<{ toolCallId: string }>;
      }
    | undefined;

  if (finishEvent == null) {
    throw new Error('Expected streamText onFinish to be called.');
  }

  const allStepToolCalls = finishEvent.steps.flatMap(step => step.toolCalls);
  const allStepToolResults = finishEvent.steps.flatMap(
    step => step.toolResults,
  );

  const observation = {
    stepCount: finishEvent.steps.length,
    finalStepToolCallCount:
      finishEvent.steps[finishEvent.steps.length - 1].toolCalls.length,
    allStepToolCallIds: allStepToolCalls.map(call => call.toolCallId),
    allStepToolResultIds: allStepToolResults.map(result => result.toolCallId),
    onFinishToolCallIds: finishEvent.toolCalls.map(call => call.toolCallId),
    onFinishDynamicToolCallIds: finishEvent.dynamicToolCalls.map(
      call => call.toolCallId,
    ),
    onFinishToolResultIds: finishEvent.toolResults.map(
      result => result.toolCallId,
    ),
    onFinishDynamicToolResultIds: finishEvent.dynamicToolResults.map(
      result => result.toolCallId,
    ),
  };

  console.log(JSON.stringify(observation, null, 2));

  if (
    allStepToolCalls.length !== 1 ||
    allStepToolResults.length !== 1 ||
    allStepToolCalls[0].toolCallId !== 'call-list-my-issues' ||
    allStepToolResults[0].toolCallId !== 'call-list-my-issues'
  ) {
    throw new Error(
      'Reproduction setup failed: the tool call and result were not recorded in the completed steps.',
    );
  }

  if (
    finishEvent.toolCalls.length === 0 &&
    finishEvent.toolResults.length === 0
  ) {
    throw new Error(
      'Reproduced issue #8578: onFinish omitted tool information from an earlier completed step.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
