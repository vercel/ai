import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, Output } from 'ai';
import { z } from 'zod';

const modelId =
  process.env.AI_SDK_ISSUE_11227_MODEL ??
  'us.anthropic.claude-opus-4-5-20251101-v1:0';
const thinkingEnabled = process.env.AI_SDK_ISSUE_11227_THINKING !== 'disabled';
const reportedError =
  'Thinking may not be enabled when tool_choice forces tool use.';

async function main() {
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

  try {
    const result = await generateText({
      model: bedrock(modelId),
      experimental_output: Output.object({
        schema: z.object({
          answer: z.string(),
        }),
      }),
      prompt: 'Return an object whose answer is exactly "ok".',
      maxOutputTokens: 128,
      maxRetries: 0,
      providerOptions: thinkingEnabled
        ? {
            bedrock: {
              reasoningConfig: {
                type: 'enabled',
                budgetTokens: 1024,
              },
            },
          }
        : undefined,
    });

    if (result.experimental_output.answer !== 'ok') {
      throw new Error(
        `Expected structured output answer "ok", received ${JSON.stringify(result.experimental_output)}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          modelId,
          thinkingEnabled,
          output: result.experimental_output,
          requestBody,
          responseBody,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(
      JSON.stringify(
        {
          modelId,
          thinkingEnabled,
          message: error instanceof Error ? error.message : String(error),
          statusCode: APICallError.isInstance(error)
            ? error.statusCode
            : undefined,
          requestBody,
          responseBody,
        },
        null,
        2,
      ),
    );

    if (
      `${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(responseBody)}`.includes(
        reportedError,
      )
    ) {
      throw new Error(
        `ISSUE_11227_REPRODUCED: ${reportedError} Output.object() did not return a structured object.`,
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
