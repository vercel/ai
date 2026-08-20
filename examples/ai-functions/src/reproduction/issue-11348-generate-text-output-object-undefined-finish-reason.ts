import assert from 'node:assert/strict';
import type {
  LanguageModelV4,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
} from '@ai-sdk/provider';
import { generateText, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod/v4';

const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      value: z.boolean(),
    }),
  ),
});

const expectedOutput = {
  items: [
    { id: 'first', value: true },
    { id: 'second', value: false },
  ],
};

const jsonText = JSON.stringify(expectedOutput);

function createModel(
  finishReason: LanguageModelV4FinishReason,
): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'issue-11348-reproduction',
    modelId: 'json-text-with-configurable-finish-reason',
    supportedUrls: {},
    async doGenerate(): Promise<LanguageModelV4GenerateResult> {
      return {
        content: [{ type: 'text', text: jsonText }],
        finishReason,
        usage: {
          inputTokens: {
            total: 5,
            noCache: 5,
            cacheRead: 0,
            cacheWrite: 0,
          },
          outputTokens: {
            total: 10,
            text: 10,
            reasoning: 0,
          },
        },
        response: {
          id: 'issue-11348-response',
          modelId: 'json-text-with-configurable-finish-reason',
          timestamp: new Date(0),
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error('doStream is not used by this reproduction');
    },
  };
}

async function generateStructuredOutput(
  finishReason: LanguageModelV4FinishReason,
) {
  return generateText({
    model: createModel(finishReason),
    messages: [{ role: 'user', content: 'Generate items' }],
    output: Output.object({ schema }),
  });
}

async function main() {
  // A missing raw provider reason is supported when the unified reason is
  // "stop". This rules out the secondary report that raw: undefined alone is
  // what prevents parsing.
  const supportedResult = await generateStructuredOutput({
    unified: 'stop',
    raw: undefined,
  });
  assert.deepEqual(supportedResult.output, expectedOutput);

  // Simulate the runtime response reported for gateways/proxies. The provider
  // contract requires a unified reason, but an external response can omit it.
  const result = await generateStructuredOutput({
    unified: undefined,
    raw: undefined,
  } as unknown as LanguageModelV4FinishReason);
  const manuallyParsedOutput = schema.parse(JSON.parse(result.text));
  assert.deepEqual(manuallyParsedOutput, expectedOutput);

  console.log(
    JSON.stringify(
      {
        finishReason: result.finishReason,
        text: result.text,
        textMatchesSchema: true,
      },
      null,
      2,
    ),
  );

  try {
    const output = result.output;
    assert.deepEqual(output, manuallyParsedOutput);
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      console.error(
        'Reproduced issue #11348: result.output threw NoOutputGeneratedError despite valid schema-matching JSON in result.text.',
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
