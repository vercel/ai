import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
} from '../../../../packages/amazon-bedrock/src/amazon-bedrock-sigv4-fetch';

const MODEL_ID = 'us.anthropic.claude-sonnet-5';
const FAILURE_SIGNAL =
  'ISSUE_18199_REPRODUCED: strict:true was removed without an unsupported warning';

async function main() {
  let requestBody: Record<string, unknown> | undefined;

  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requestBody = JSON.parse(init.body);
      }

      return fetch(input, init);
    },
  });

  const result = await generateText({
    model: bedrock(MODEL_ID),
    maxOutputTokens: 64,
    prompt: 'Use get_weather for Seattle.',
    toolChoice: 'required',
    tools: {
      get_weather: tool({
        description: 'Get the weather for a city.',
        inputSchema: z.object({
          city: z.string(),
        }),
        strict: true,
      }),
    },
  });

  const toolSpec = (
    requestBody?.toolConfig as
      | {
          tools?: Array<{
            toolSpec?: { strict?: boolean };
          }>;
        }
      | undefined
  )?.tools?.[0]?.toolSpec;

  const strictWarning = result.warnings?.find(warning =>
    JSON.stringify(warning).toLowerCase().includes('strict'),
  );

  const directRequestBody = {
    messages: [
      {
        role: 'user',
        content: [{ text: 'Use get_weather for Seattle.' }],
      },
    ],
    inferenceConfig: { maxTokens: 64 },
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: 'get_weather',
            description: 'Get the weather for a city.',
            strict: true,
            inputSchema: {
              json: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
                additionalProperties: false,
              },
            },
          },
        },
      ],
      toolChoice: { any: {} },
    },
  };

  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const directFetch =
    apiKey != null
      ? createApiKeyFetchFunction(apiKey)
      : createSigV4FetchFunction(() => ({
          region: 'us-east-1',
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
          sessionToken: process.env.AWS_SESSION_TOKEN,
        }));
  const directResponse = await directFetch(
    `https://bedrock-runtime.us-east-1.amazonaws.com/model/${MODEL_ID}/converse`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(directRequestBody),
    },
  );
  const directResponseText = await directResponse.text();

  console.log(
    JSON.stringify(
      {
        modelId: MODEL_ID,
        toolCallCount: result.toolCalls.length,
        strictSent: toolSpec?.strict === true,
        warnings: result.warnings ?? [],
        directStrictRequest: {
          status: directResponse.status,
          body: directResponseText,
        },
      },
      null,
      2,
    ),
  );

  if (toolSpec?.strict === true) {
    throw new Error(
      'Expected the current provider capability guard to remove strict:true.',
    );
  }

  if (directResponse.status !== 400 || !directResponseText.includes('strict')) {
    throw new Error(
      `Expected the direct Bedrock request with strict:true to fail with a strict validation error; received ${directResponse.status}: ${directResponseText}`,
    );
  }

  if (strictWarning == null) {
    throw new Error(FAILURE_SIGNAL);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
