import assert from 'node:assert/strict';
import { generateText, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

const toolTimeoutMs = 10;
const toolDelayMs = 60;

async function main() {
  const model = new MockLanguageModelV4({
    doGenerate: {
      content: [
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'slow',
          input: '{}',
        },
      ],
      warnings: [],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
      usage: {
        inputTokens: {
          total: 1,
          noCache: 1,
          cacheRead: 0,
          cacheWrite: 0,
        },
        outputTokens: { total: 1, text: 0, reasoning: 0 },
      },
    },
  });

  let signalAbortedAtReturn = false;
  const result = await generateText({
    model,
    prompt: 'test',
    maxRetries: 0,
    timeout: { toolMs: toolTimeoutMs },
    tools: {
      slow: tool({
        inputSchema: jsonSchema({ type: 'object' }),
        async execute(_, { abortSignal }) {
          await new Promise(resolve => setTimeout(resolve, toolDelayMs));
          signalAbortedAtReturn = abortSignal?.aborted === true;
          return 'late successful value';
        },
      }),
    },
  });

  const output = result.content.find(
    part => part.type === 'tool-result' || part.type === 'tool-error',
  );

  console.log({
    signalAbortedAtReturn,
    type: output?.type,
    output: output?.type === 'tool-result' ? output.output : undefined,
  });

  assert.equal(
    signalAbortedAtReturn,
    true,
    'reproduction setup failed: the tool timeout signal did not abort before the tool returned',
  );
  assert.ok(output, 'reproduction setup failed: no tool output was produced');
  assert.equal(
    output.type,
    'tool-error',
    'ISSUE_22878_REPRODUCED: toolMs accepted a late successful tool result',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
