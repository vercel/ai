import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from '@ai-sdk/provider';
import { generateText, NoOutputGeneratedError, Output } from 'ai';
import { z } from 'zod';

const schema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      value: z.boolean(),
    }),
  ),
});

const validJsonText = JSON.stringify({
  items: [{ id: 'item-1', value: true }],
});

const testUsage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

const modelWithMissingFinishReason: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'issue-11348-repro',
  modelId: 'missing-finish-reason',
  supportedUrls: {},
  async doGenerate(
    _options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    return {
      content: [{ type: 'text', text: validJsonText }],
      // This intentionally simulates a gateway/proxy response that leaves the
      // unified finish reason undefined even though valid JSON text is present.
      finishReason: { unified: undefined, raw: undefined },
      usage: testUsage,
      warnings: [],
    } as unknown as LanguageModelV4GenerateResult;
  },
  async doStream(): Promise<LanguageModelV4StreamResult> {
    throw new Error('streaming is not used by this reproduction');
  },
};

async function main() {
  const result = await generateText({
    model: modelWithMissingFinishReason,
    messages: [{ role: 'user', content: 'Generate items' }],
    output: Output.object({ schema }),
  });

  console.log(
    JSON.stringify(
      {
        finishReason: result.finishReason,
        rawFinishReason: result.rawFinishReason,
        text: result.text,
        textParsesWithSchema: schema.safeParse(JSON.parse(result.text)).success,
      },
      null,
      2,
    ),
  );

  try {
    console.log('result.output:', result.output);
  } catch (error) {
    if (NoOutputGeneratedError.isInstance(error)) {
      console.error(
        'Reproduced issue #11348: result.output throws NoOutputGeneratedError even though result.text contains schema-valid JSON.',
      );
      throw error;
    }

    throw error;
  }

  throw new Error(
    'Issue #11348 was not reproduced: result.output returned successfully.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
