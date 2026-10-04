import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const expectedProviderOptions = {
  openai: { itemId: 'message-1', phase: 'final_answer' },
};

function createModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      warnings: [],
      stream: new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: 'text-start',
            id: 'text-1',
            providerMetadata: expectedProviderOptions,
          });
          controller.enqueue({
            type: 'text-delta',
            id: 'text-1',
            delta: 'An answer.',
          });
          controller.enqueue({ type: 'text-end', id: 'text-1' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 1, text: 1, reasoning: 0 },
            },
          });
          controller.close();
        },
      }),
    }),
  });
}

async function main() {
  const control = await new ToolLoopAgent({
    model: createModel(),
  }).stream({ prompt: 'Write an answer.' });
  const controlMessages = await control.responseMessages;
  const controlMessage = controlMessages.at(-1);
  assert.equal(
    controlMessage?.role,
    'assistant',
    'Control failure: ToolLoopAgent did not return an assistant message.',
  );
  assert.ok(
    Array.isArray(controlMessage.content),
    'Control failure: ToolLoopAgent assistant message was not multipart.',
  );
  const controlText = controlMessage.content.find(part => part.type === 'text');
  assert.deepEqual(
    controlText?.providerOptions,
    expectedProviderOptions,
    'Control failure: ToolLoopAgent did not preserve text provider metadata.',
  );

  const result = await new WorkflowAgent({
    model: createModel(),
  }).stream({ prompt: 'Write an answer.' });
  const stepText = result.steps[0]?.content.find(part => part.type === 'text');
  assert.deepEqual(
    stepText?.providerMetadata,
    expectedProviderOptions,
    'Setup failure: WorkflowAgent step content did not retain provider metadata.',
  );

  const continuation = result.messages.at(-1);
  assert.equal(
    continuation?.role,
    'assistant',
    'Setup failure: WorkflowAgent did not return an assistant continuation.',
  );
  assert.ok(
    Array.isArray(continuation.content),
    'Setup failure: WorkflowAgent assistant continuation was not multipart.',
  );

  const continuationText = continuation.content.find(
    part => part.type === 'text',
  );
  if (
    !continuationText ||
    !isDeepStrictEqual(
      continuationText.providerOptions,
      expectedProviderOptions,
    )
  ) {
    throw new Error(
      'ISSUE_22010: WorkflowAgent continuation text dropped providerOptions',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
