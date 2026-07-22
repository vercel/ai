import {
  createAmazonBedrock,
  type AmazonBedrockLanguageModelChatOptions,
} from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  const modelId =
    process.env.AI_SDK_ISSUE_11227_MODEL ?? 'us.anthropic.claude-opus-4-6-v1';
  let requestBody: unknown;
  let responseBody: unknown;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body);
      }

      const response = await globalThis.fetch(input, init);
      responseBody = await response.clone().json();
      return response;
    },
  });

  const result = await generateText({
    model: bedrock(modelId),
    output: Output.object({
      schema: z.object({
        answer: z.string(),
      }),
    }),
    prompt: 'Return an object whose answer is exactly "ok".',
    maxOutputTokens: 128,
    maxRetries: 0,
    providerOptions: {
      bedrock: {
        reasoningConfig: {
          type: 'enabled',
          budgetTokens: 1024,
        },
      } satisfies AmazonBedrockLanguageModelChatOptions,
    },
  });

  if (result.output.answer !== 'ok') {
    throw new Error(
      `Expected structured output answer "ok", received ${JSON.stringify(result.output)}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        modelId,
        output: result.output,
        requestBody,
        responseBody,
      },
      null,
      2,
    ),
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
