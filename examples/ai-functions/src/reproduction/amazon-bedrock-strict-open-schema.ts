import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, generateText, jsonSchema, tool } from 'ai';

const region = 'ap-northeast-1';
const modelId = 'jp.anthropic.claude-haiku-4-5-20251001-v1:0';

async function main() {
  let requestBody: unknown;

  const bedrock = createAmazonBedrock({
    region,
    fetch: async (input, init) => {
      requestBody =
        typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
      return fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: bedrock(modelId),
      maxOutputTokens: 64,
      maxRetries: 0,
      prompt: 'Weather in Tokyo? Use the tool.',
      toolChoice: { type: 'tool', toolName: 'getWeather' },
      tools: {
        getWeather: tool({
          description: 'Get the weather for a city',
          strict: true,
          inputSchema: jsonSchema<{ where: { city: string } }>({
            type: 'object',
            properties: {
              where: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
            required: ['where'],
            additionalProperties: false,
          }),
        }),
      },
    });

    if (result.toolCalls[0]?.toolName !== 'getWeather') {
      throw new Error(
        `Expected a getWeather tool call, received ${JSON.stringify(result.toolCalls)}`,
      );
    }

    console.log(
      'PASS: strict tool with an open JSON schema completed without a Bedrock 400.',
    );
  } catch (error) {
    if (
      !APICallError.isInstance(error) &&
      error instanceof Error &&
      error.message.includes('additionalProperties')
    ) {
      console.log(
        'PASS: provider rejected the incompatible strict schema locally with a specific error.',
      );
      return;
    }

    if (
      APICallError.isInstance(error) &&
      error.statusCode === 400 &&
      error.message.includes(
        "For 'object' type, 'additionalProperties' must be explicitly set to false",
      )
    ) {
      const toolSpec = (
        requestBody as {
          toolConfig?: {
            tools?: Array<{
              toolSpec?: {
                strict?: boolean;
                inputSchema?: {
                  json?: {
                    properties?: {
                      where?: { additionalProperties?: boolean };
                    };
                  };
                };
              };
            }>;
          };
        }
      ).toolConfig?.tools?.[0]?.toolSpec;

      if (
        toolSpec?.strict !== true ||
        toolSpec.inputSchema?.json?.properties?.where?.additionalProperties !==
          undefined
      ) {
        throw new Error(
          `Bedrock returned the reported 400, but the outgoing tool did not preserve the reported open strict schema: ${JSON.stringify(toolSpec)}`,
        );
      }

      console.error(
        'ISSUE_REPRODUCED: Bedrock rejected strict tool with nested open object schema (HTTP 400)',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
