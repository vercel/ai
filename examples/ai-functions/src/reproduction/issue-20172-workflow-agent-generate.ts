import assert from 'node:assert/strict';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { ToolLoopAgent } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

const expectedText = 'durable hello';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 2,
    text: 2,
    reasoning: undefined,
  },
};

function createModel() {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text: expectedText }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage,
      warnings: [],
    }),
    doStream: async () => {
      const chunks: LanguageModelV4StreamPart[] = [
        { type: 'stream-start', warnings: [] },
        { type: 'text-start', id: 'text-1' },
        { type: 'text-delta', id: 'text-1', delta: expectedText },
        { type: 'text-end', id: 'text-1' },
        {
          type: 'finish',
          finishReason: { unified: 'stop', raw: 'stop' },
          usage,
        },
      ];

      return { stream: convertArrayToReadableStream(chunks) };
    },
  });
}

async function main() {
  const toolLoopResult = await new ToolLoopAgent({
    model: createModel(),
  }).generate({ prompt: 'Say hello.' });

  assert.equal(toolLoopResult.text, expectedText);

  const workflowAgent = new WorkflowAgent({ model: createModel() });
  const generate = workflowAgent.generate as unknown as (options: {
    prompt: string;
  }) => PromiseLike<{ text: string }>;

  let workflowResult: { text: string };
  try {
    workflowResult = await generate.call(workflowAgent, {
      prompt: 'Say hello.',
    });
  } catch (error) {
    assert.fail(
      `ISSUE #20172: WorkflowAgent.generate failed instead of returning generated text: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  assert.equal(
    workflowResult.text,
    expectedText,
    'ISSUE #20172: WorkflowAgent.generate did not return ToolLoopAgent-compatible text',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
