import assert from 'node:assert/strict';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { ToolLoopAgent, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const partialAnswer = 'A partial answer.';
const failureSignal =
  'ISSUE #22011: WorkflowAgent omitted the length-finished partial assistant response from result.messages';

function createModel(parts: LanguageModelV4StreamPart[]) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      warnings: [],
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of parts) {
            controller.enqueue(part);
          }
          controller.close();
        },
      }),
    }),
  });
}

function hasFinalPartialAssistantMessage(messages: ModelMessage[]) {
  const message = messages.at(-1);
  return (
    message?.role === 'assistant' &&
    Array.isArray(message.content) &&
    message.content.some(
      part => part.type === 'text' && part.text === partialAnswer,
    )
  );
}

async function main() {
  const parts: LanguageModelV4StreamPart[] = [
    { type: 'text-start', id: 'text-1' },
    {
      type: 'text-delta',
      id: 'text-1',
      delta: partialAnswer,
    },
    { type: 'text-end', id: 'text-1' },
    {
      type: 'finish',
      finishReason: { unified: 'length', raw: 'length' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: undefined,
          cacheWrite: undefined,
        },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
    },
  ];

  const control = await new ToolLoopAgent({
    model: createModel(parts),
  }).stream({ prompt: 'Write an answer.' });
  const controlMessages = await control.responseMessages;

  assert.ok(
    hasFinalPartialAssistantMessage(controlMessages),
    'ToolLoopAgent control did not preserve the partial assistant response',
  );

  const result = await new WorkflowAgent({
    model: createModel(parts),
  }).stream({ prompt: 'Write an answer.' });

  assert.equal(result.finishReason, 'length');
  assert.equal(result.steps[0]?.text, partialAnswer);

  console.log(
    JSON.stringify(
      {
        finishReason: result.finishReason,
        stepText: result.steps[0]?.text,
        messages: result.messages,
        controlMessages,
      },
      null,
      2,
    ),
  );

  assert.ok(hasFinalPartialAssistantMessage(result.messages), failureSignal);
}

await main();
