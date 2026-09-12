import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

async function main() {
  let requestBody: unknown;

  const bedrock = createAmazonBedrock({
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
      model: bedrock(modelId),
      prompt: 'Use get_weather to get the weather in Seattle.',
      maxOutputTokens: 128,
      toolChoice: { type: 'tool', toolName: 'get_weather' },
      tools: {
        get_weather: tool({
          description: 'Get weather for a city',
          inputSchema: z.object({ city: z.string() }),
          strict: true,
        }),
      },
    });

    const strict = (
      requestBody as {
        toolConfig?: {
          tools?: Array<{ toolSpec?: { strict?: boolean } }>;
        };
      }
    )?.toolConfig?.tools?.[0]?.toolSpec?.strict;

    if (strict !== true) {
      throw new Error(
        `Expected the AI SDK request to forward strict: true, received ${String(strict)}`,
      );
    }

    if (
      !result.toolCalls.some(
        toolCall =>
          toolCall.toolName === 'get_weather' &&
          (toolCall.input as { city?: string }).city === 'Seattle',
      )
    ) {
      throw new Error(
        'Expected Claude Haiku 4.5 to return the forced get_weather tool call for Seattle',
      );
    }

    console.log(
      'ISSUE_20681_NOT_REPRODUCED: Claude Haiku 4.5 accepted strict: true and returned the forced tool call.',
    );
  } catch (error) {
    const errorDetails = JSON.stringify(
      error,
      Object.getOwnPropertyNames(error),
    );

    if (
      errorDetails.includes('400') &&
      errorDetails.toLowerCase().includes('strict')
    ) {
      throw new Error(
        'ISSUE_20681_REPRODUCED: Claude Haiku 4.5 rejected strict in toolSpec with HTTP 400.',
        { cause: error },
      );
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
