import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import assert from 'node:assert/strict';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

async function main() {
  let forwardedStrict: unknown;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      const requestBodyText = init?.body;
      if (typeof requestBodyText !== 'string') {
        throw new Error('Expected the Bedrock request body to be JSON text.');
      }

      const requestBody = JSON.parse(requestBodyText) as {
        toolConfig?: {
          tools?: Array<{ toolSpec?: { strict?: unknown } }>;
        };
      };
      forwardedStrict = requestBody.toolConfig?.tools?.[0]?.toolSpec?.strict;

      return fetch(input, init);
    },
  });

  const result = await generateText({
    model: bedrock(modelId),
    maxOutputTokens: 128,
    tools: {
      getWeather: tool({
        description: 'Get the weather for a city',
        inputSchema: z.object({ city: z.string() }),
        strict: true,
      }),
    },
    toolChoice: { type: 'tool', toolName: 'getWeather' },
    prompt: 'What is the weather in San Francisco? Use the getWeather tool.',
  });

  assert.equal(
    forwardedStrict,
    true,
    'The reproduction did not send toolSpec.strict: true.',
  );
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].toolName, 'getWeather');
  assert.deepEqual(result.toolCalls[0].input, { city: 'San Francisco' });

  console.log(
    `Claude Haiku 4.5 accepted toolSpec.strict: true and returned the forced getWeather tool call.`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
