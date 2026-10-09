import assert from 'node:assert/strict';
import type {
  LanguageModelV2,
  LanguageModelV2StreamPart,
} from '@ai-sdk/provider';
import { dynamicTool, stepCountIs, streamText } from 'ai';
import { z } from 'zod';

const toolCallId = 'call-list-my-issues';

function convertArrayToReadableStream<T>(values: T[]): ReadableStream<T> {
  return new ReadableStream({
    start(controller) {
      for (const value of values) {
        controller.enqueue(value);
      }
      controller.close();
    },
  });
}

async function main() {
  let responseCount = 0;
  let observed:
    | {
        dynamicToolCallIds: string[];
        dynamicToolResultIds: string[];
        finalStepToolCallIds: string[];
        finalStepToolResultIds: string[];
        stepCount: number;
        stepToolCallIds: string[];
        stepToolResultIds: string[];
        text: string;
        toolCallIds: string[];
        toolResultIds: string[];
      }
    | undefined;

  const model: LanguageModelV2 = {
    specificationVersion: 'v2',
    provider: 'issue-8578-reproduction',
    modelId: 'deterministic-tool-loop',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('doGenerate is not used by this reproduction');
    },
    doStream: async () => {
      switch (responseCount++) {
        case 0:
          return {
            stream: convertArrayToReadableStream<LanguageModelV2StreamPart>([
              {
                type: 'tool-call',
                toolCallId,
                toolName: 'list_my_issues',
                input: JSON.stringify({
                  limit: 5,
                  orderBy: 'updatedAt',
                }),
              },
              {
                type: 'finish',
                finishReason: 'tool-calls',
                usage: {
                  inputTokens: 10,
                  outputTokens: 5,
                  totalTokens: 15,
                },
              },
            ]),
          };
        case 1:
          return {
            stream: convertArrayToReadableStream<LanguageModelV2StreamPart>([
              { type: 'text-start', id: 'text-1' },
              {
                type: 'text-delta',
                id: 'text-1',
                delta: 'Here are your 5 latest Linear issues.',
              },
              { type: 'text-end', id: 'text-1' },
              {
                type: 'finish',
                finishReason: 'stop',
                usage: {
                  inputTokens: 20,
                  outputTokens: 10,
                  totalTokens: 30,
                },
              },
            ]),
          };
        default:
          throw new Error(`Unexpected model response ${responseCount}`);
      }
    },
  };

  const result = streamText({
    model,
    prompt: 'Fetch my latest Linear issues.',
    tools: {
      list_my_issues: dynamicTool({
        inputSchema: z.object({
          limit: z.number(),
          orderBy: z.string(),
        }),
        execute: async () => ({
          issues: [{ id: 'ISSUE-1', title: 'Example issue' }],
        }),
      }),
    },
    stopWhen: stepCountIs(10),
    onFinish: finishResult => {
      const finalStep = finishResult.steps.at(-1);

      observed = {
        dynamicToolCallIds: finishResult.dynamicToolCalls.map(
          toolCall => toolCall.toolCallId,
        ),
        dynamicToolResultIds: finishResult.dynamicToolResults.map(
          toolResult => toolResult.toolCallId,
        ),
        finalStepToolCallIds:
          finalStep?.toolCalls.map(toolCall => toolCall.toolCallId) ?? [],
        finalStepToolResultIds:
          finalStep?.toolResults.map(toolResult => toolResult.toolCallId) ?? [],
        stepCount: finishResult.steps.length,
        stepToolCallIds: finishResult.steps.flatMap(step =>
          step.toolCalls.map(toolCall => toolCall.toolCallId),
        ),
        stepToolResultIds: finishResult.steps.flatMap(step =>
          step.toolResults.map(toolResult => toolResult.toolCallId),
        ),
        text: finishResult.text,
        toolCallIds: finishResult.toolCalls.map(
          toolCall => toolCall.toolCallId,
        ),
        toolResultIds: finishResult.toolResults.map(
          toolResult => toolResult.toolCallId,
        ),
      };
    },
  });

  await result.consumeStream();

  assert.ok(observed, 'onFinish should have been called');
  assert.equal(responseCount, 2);
  assert.equal(observed.stepCount, 2);
  assert.equal(observed.text, 'Here are your 5 latest Linear issues.');
  assert.deepEqual(observed.stepToolCallIds, [toolCallId]);
  assert.deepEqual(observed.stepToolResultIds, [toolCallId]);
  assert.deepEqual(observed.finalStepToolCallIds, []);
  assert.deepEqual(observed.finalStepToolResultIds, []);

  console.log(JSON.stringify(observed, null, 2));

  assert.deepEqual(
    {
      dynamicToolCallIds: observed.dynamicToolCallIds,
      dynamicToolResultIds: observed.dynamicToolResultIds,
      toolCallIds: observed.toolCallIds,
      toolResultIds: observed.toolResultIds,
    },
    {
      dynamicToolCallIds: [toolCallId],
      dynamicToolResultIds: [toolCallId],
      toolCallIds: [toolCallId],
      toolResultIds: [toolCallId],
    },
    'onFinish should expose tool calls and results executed in earlier steps',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
