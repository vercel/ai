import {
  createAmazonBedrock,
  type AmazonBedrockLanguageModelOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const models = {
  'opus-4.5': 'us.anthropic.claude-opus-4-5-20251101-v1:0',
  'sonnet-4.0': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'haiku-4.5': 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  'sonnet-4.5': 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
  'opus-4.6': 'us.anthropic.claude-opus-4-6-v1',
} as const;

async function main() {
  const modelName = process.env.MODEL ?? 'opus-4.5';

  if (!(modelName in models)) {
    throw new Error(`Unknown MODEL: ${modelName}`);
  }

  const modelId = models[modelName as keyof typeof models];
  let requestBody: Record<string, unknown> | undefined;

  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
    fetch: async (url, options) => {
      requestBody = JSON.parse(String(options?.body));
      return fetch(url, options);
    },
  });

  const result = await generateText({
    model: bedrock(modelId),
    prompt: 'Return an object whose answer is exactly "ok".',
    output: Output.object({
      schema: z.object({
        answer: z.string(),
      }),
    }),
    maxRetries: 0,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      } satisfies AmazonBedrockLanguageModelOptions,
    },
  });

  if (result.output.answer !== 'ok') {
    throw new Error(
      `Expected {"answer":"ok"}, received ${JSON.stringify(result.output)}`,
    );
  }

  if (requestBody?.toolConfig != null) {
    throw new Error(
      `Expected no forced toolConfig, received ${JSON.stringify(requestBody.toolConfig)}`,
    );
  }

  const additionalFields = requestBody?.additionalModelRequestFields as
    | {
        output_config?: { format?: unknown };
        thinking?: unknown;
      }
    | undefined;

  if (
    additionalFields?.output_config?.format == null ||
    additionalFields.thinking == null
  ) {
    throw new Error(
      `Expected thinking with native output_config.format, received ${JSON.stringify(requestBody)}`,
    );
  }

  console.log(
    JSON.stringify({
      model: modelName,
      modelId,
      output: result.output,
      request: {
        hasThinking: true,
        hasNativeOutputFormat: true,
        hasForcedToolConfig: false,
      },
    }),
  );
}

main().catch(error => {
  console.error(
    `ISSUE_11227_FAILURE: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
