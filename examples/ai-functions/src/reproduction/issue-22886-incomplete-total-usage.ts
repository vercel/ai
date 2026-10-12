import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { generateText, isStepCount, jsonSchema, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

class ReproducedBugError extends Error {}

async function run(firstInputTokens: number | undefined) {
  const model = new MockLanguageModelV4({
    doGenerate: [
      {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'lookup',
            input: '{}',
          },
        ],
        warnings: [],
        finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
        usage: {
          inputTokens: {
            total: firstInputTokens,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 1,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
      {
        content: [{ type: 'text', text: 'done' }],
        warnings: [],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: {
          inputTokens: {
            total: 2,
            noCache: undefined,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 3,
            text: undefined,
            reasoning: undefined,
          },
        },
      },
    ],
  });

  const result = await generateText({
    model,
    prompt: 'test',
    maxRetries: 0,
    stopWhen: isStepCount(2),
    tools: {
      lookup: tool({
        inputSchema: jsonSchema({ type: 'object' }),
        execute: async () => 'ok',
      }),
    },
  });

  assert.equal(result.steps.length, 2, 'expected a successful two-step run');

  return {
    stepInputTokens: result.steps.map(step => step.usage.inputTokens),
    totalUsage: result.totalUsage,
  };
}

async function main() {
  const missing = await run(undefined);
  const knownZero = await run(0);

  assert.deepEqual(missing.stepInputTokens, [undefined, 2]);
  assert.deepEqual(knownZero.stepInputTokens, [0, 2]);
  assert.deepEqual(knownZero.totalUsage, {
    inputTokens: 2,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokens: 4,
    outputTokenDetails: {
      textTokens: undefined,
      reasoningTokens: undefined,
    },
    totalTokens: 6,
  });

  if (isDeepStrictEqual(missing.totalUsage, knownZero.totalUsage)) {
    throw new ReproducedBugError(
      'ISSUE_22886: totalUsage is identical for a missing token count and a reported zero',
    );
  }

  console.log('Issue #22886 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
