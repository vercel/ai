import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
const region = 'us-east-1';

async function main() {
  let requestBody: unknown;
  let responseStatus: number | undefined;

  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body);
      }

      const response = await fetch(input, init);
      responseStatus = response.status;
      return response;
    },
  });

  const result = await generateText({
    model: bedrock(modelId),
    prompt: 'Use getWeather to check the weather in Seattle.',
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({
          city: z.string(),
        }),
        strict: true,
      }),
    },
    toolChoice: { type: 'tool', toolName: 'getWeather' },
    maxOutputTokens: 100,
  });

  const strict = (
    requestBody as {
      toolConfig?: { tools?: Array<{ toolSpec?: { strict?: boolean } }> };
    }
  )?.toolConfig?.tools?.[0]?.toolSpec?.strict;

  if (strict !== true) {
    throw new Error(
      'Setup failure: AI SDK did not forward toolSpec.strict: true for Claude Haiku 4.5.',
    );
  }

  const toolCall = result.toolCalls.find(
    toolCall => toolCall.toolName === 'getWeather',
  );

  if (responseStatus !== 200 || toolCall == null) {
    throw new Error(
      `Issue #20681 reproduced: Claude Haiku 4.5 did not accept the strict tool request (HTTP ${responseStatus ?? 'unknown'}).`,
    );
  }

  console.log(
    JSON.stringify(
      {
        modelId,
        region,
        responseStatus,
        forwardedStrict: strict,
        toolCall: {
          toolName: toolCall.toolName,
          input: toolCall.input,
        },
        warnings: result.warnings,
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
