import assert from 'node:assert/strict';
import type { LanguageModelV3GenerateResult } from '@ai-sdk/provider';
import { generateText, Output } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { z } from 'zod';

const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      value: z.boolean(),
    }),
  ),
});

const expectedOutput = {
  items: [{ id: 'item-1', value: true }],
};
const validJson = JSON.stringify(expectedOutput);

const usage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

function createModel({
  unified,
  raw,
}: {
  unified: 'stop' | undefined;
  raw: string | undefined;
}) {
  return new MockLanguageModelV3({
    doGenerate: async () =>
      ({
        content: [{ type: 'text', text: validJson }],
        finishReason: { unified, raw },
        usage,
        warnings: [],
      }) as LanguageModelV3GenerateResult,
  });
}

async function generateWithFinishReason({
  unified,
  raw,
}: {
  unified: 'stop' | undefined;
  raw: string | undefined;
}) {
  return generateText({
    model: createModel({ unified, raw }),
    messages: [{ role: 'user', content: 'Generate items' }],
    output: Output.object({ schema }),
  });
}

async function main() {
  const missingFinishReasonResult = await generateWithFinishReason({
    unified: undefined,
    raw: undefined,
  });

  assert.equal(missingFinishReasonResult.text, validJson);
  assert.deepEqual(
    schema.parse(JSON.parse(missingFinishReasonResult.text)),
    expectedOutput,
  );
  assert.equal(missingFinishReasonResult.finishReason, undefined);
  assert.equal(missingFinishReasonResult.rawFinishReason, undefined);
  assert.deepEqual(missingFinishReasonResult.output, expectedOutput);

  const missingRawReasonControl = await generateWithFinishReason({
    unified: 'stop',
    raw: undefined,
  });

  assert.equal(missingRawReasonControl.finishReason, 'stop');
  assert.equal(missingRawReasonControl.rawFinishReason, undefined);
  assert.deepEqual(missingRawReasonControl.output, expectedOutput);

  console.log(
    'Issue #11348 could not be reproduced: Output.object parsed valid JSON when the unified finish reason was undefined.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
