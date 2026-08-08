import type { LanguageModelV4 } from '@ai-sdk/provider';
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

const jsonText = JSON.stringify({
  items: [
    { id: 'first', value: true },
    { id: 'second', value: false },
  ],
});

const model: LanguageModelV4 = {
  specificationVersion: 'v4',
  provider: 'issue-11348-reproduction',
  modelId: 'undefined-finish-reason-with-json-text',
  supportedUrls: {},
  async doGenerate() {
    return {
      content: [{ type: 'text', text: jsonText }],
      // Simulates a gateway/proxy response where the SDK-normalized finish reason
      // is missing even though the model returned complete, valid JSON text.
      finishReason: { unified: undefined, raw: undefined },
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
        modelId: 'undefined-finish-reason-with-json-text',
        timestamp: new Date(0),
      },
      warnings: [],
    } as unknown as Awaited<ReturnType<LanguageModelV4['doGenerate']>>;
  },
  async doStream() {
    throw new Error('doStream is not used by this reproduction');
  },
};

async function main() {
  const result = await generateText({
    model,
    messages: [{ role: 'user', content: 'Generate items' }],
    output: Output.object({ schema }),
  });

  const manuallyParsedOutput = schema.parse(JSON.parse(result.text));

  console.log(
    JSON.stringify(
      {
        finishReason: result.finishReason,
        text: result.text,
        manuallyParsedOutput,
      },
      null,
      2,
    ),
  );

  try {
    const output = result.output;

    if (JSON.stringify(output) !== JSON.stringify(manuallyParsedOutput)) {
      throw new Error(
        `Expected result.output to match schema-parsed result.text. Received: ${JSON.stringify(
          output,
        )}`,
      );
    }
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
