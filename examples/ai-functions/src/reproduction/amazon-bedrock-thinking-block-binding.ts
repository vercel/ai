import { createAmazonBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText } from 'ai';

async function main() {
  let requestBody: Record<string, unknown> | undefined;
  const modelId =
    process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-opus-4-7';

  const provider = createAmazonBedrockAnthropic({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body) as Record<string, unknown>;
      }
      return globalThis.fetch(input, init);
    },
  });

  const result = await generateText({
    model: provider(modelId),
    prompt: 'Reply with OK.',
    maxOutputTokens: 64,
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      },
    },
  });

  const thinking = requestBody?.thinking as
    | {
        block_binding?: Record<string, unknown>;
      }
    | undefined;
  const beta = requestBody?.anthropic_beta;
  const binding = thinking?.block_binding;
  const serializedField =
    binding?.mismatch_behavior === 'drop_block'
      ? 'mismatch_behavior'
      : binding?.prefix_mismatch_behavior === 'drop_block'
        ? 'prefix_mismatch_behavior'
        : undefined;

  if (
    result.text.length === 0 ||
    serializedField == null ||
    !Array.isArray(beta) ||
    !beta.includes('thinking-binding-controls-2026-08-01')
  ) {
    throw new Error(
      'The request did not return text with the configured thinking block binding and beta.',
    );
  }

  console.log(
    `ISSUE_20729_NOT_REPRODUCED: Amazon Bedrock ${modelId} returned text successfully when AI SDK serialized ${serializedField}.`,
  );
}

main();
