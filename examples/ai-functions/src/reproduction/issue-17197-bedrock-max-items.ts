import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, Output } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0';
const providerErrorSignal =
  "For 'array' type, property 'maxItems' is not supported";

async function main() {
  let requestBody: unknown;

  const amazonBedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body);
      }
      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: amazonBedrock(modelId),
      output: Output.object({
        schema: z.object({
          labels: z
            .array(
              z.object({
                label: z.string(),
                explanation: z.string(),
              }),
            )
            .max(3),
        }),
      }),
      prompt:
        'Return three short labels for the seasons, each with a one-sentence explanation.',
      maxOutputTokens: 256,
      maxRetries: 0,
    });

    console.log(
      JSON.stringify(
        {
          modelId,
          expected:
            'Bedrock accepts the structured-output request while AI SDK retains local max(3) validation.',
          output: result.output,
          requestBody: result.request.body,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    const details = APICallError.isInstance(error)
      ? {
          name: error.name,
          message: error.message,
          statusCode: error.statusCode,
          responseBody: error.responseBody,
          requestBody,
        }
      : {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
          requestBody,
        };

    console.error(JSON.stringify(details, null, 2));

    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      `${error.message}\n${error.responseBody ?? ''}`.includes(
        providerErrorSignal,
      )
    ) {
      throw new Error(
        `Reproduced issue #17197: Bedrock rejected Output.object() because output_config.format.schema contains unsupported maxItems.`,
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
