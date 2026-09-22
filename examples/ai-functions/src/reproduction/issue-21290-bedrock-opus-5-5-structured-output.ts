import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, Output } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const MODEL_ID = 'us.anthropic.claude-opus-5-5';
const FAILURE_SIGNAL =
  'ISSUE_21290_REPRODUCED: Bedrock rejected AI SDK forced JSON tool use for Claude Opus 5.5';

async function main() {
  let requestBody: Record<string, unknown> | undefined;

  const bedrock = createAmazonBedrock({
    region: process.env.AWS_REGION ?? 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body);
      }
      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: bedrock(MODEL_ID),
      maxRetries: 0,
      output: Output.object({
        schema: z.object({
          answer: z.literal('OK'),
        }),
      }),
      prompt: 'Return the answer OK.',
    });

    if (result.output.answer !== 'OK') {
      throw new Error(
        `Expected structured output {"answer":"OK"}, received ${JSON.stringify(result.output)}`,
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      typeof error === 'object' &&
      error != null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const toolConfig = requestBody?.toolConfig as
      | {
          tools?: Array<{ toolSpec?: { name?: string } }>;
          toolChoice?: { any?: Record<string, never> };
        }
      | undefined;
    const usedForcedJsonTool =
      toolConfig?.tools?.some(tool => tool.toolSpec?.name === 'json') ===
        true && toolConfig.toolChoice?.any != null;
    const isForcedToolRejection =
      statusCode === 400 &&
      /(tool.?choice|forced tool|tool use)/i.test(message);

    if (usedForcedJsonTool && isForcedToolRejection) {
      console.error(FAILURE_SIGNAL);
      console.error(message);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
