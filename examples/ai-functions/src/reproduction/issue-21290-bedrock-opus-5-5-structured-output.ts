import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateObject, generateText } from 'ai';
import { z } from 'zod';

const modelId = 'us.anthropic.claude-opus-5-5';
const expected = { answer: 'OK' };

type CapturedRequest = {
  additionalModelRequestFields?: Record<string, unknown>;
  toolConfig?: {
    tools?: Array<{
      toolSpec?: {
        name?: string;
      };
    }>;
    toolChoice?: {
      any?: Record<string, never>;
    };
  };
};

async function main() {
  const requests: CapturedRequest[] = [];
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      if (typeof init?.body === 'string') {
        requests.push(JSON.parse(init.body) as CapturedRequest);
      }
      return fetch(input, init);
    },
  });

  const control = await generateText({
    model: bedrock(modelId),
    prompt:
      'Return only this JSON object with no markdown or extra text: {"answer":"OK"}',
  });

  const controlObject = JSON.parse(control.text) as unknown;
  if (JSON.stringify(controlObject) !== JSON.stringify(expected)) {
    throw new Error(
      `Control request did not return the expected JSON: ${control.text}`,
    );
  }

  try {
    const result = await generateObject({
      model: bedrock(modelId),
      schema: z.object({
        answer: z.literal('OK'),
      }),
      prompt: 'Return the answer OK.',
    });

    if (JSON.stringify(result.object) !== JSON.stringify(expected)) {
      throw new Error(
        `Structured output returned an unexpected object: ${JSON.stringify(result.object)}`,
      );
    }
  } catch (error) {
    const request = requests.at(-1);
    const usesSyntheticJsonTool =
      request?.toolConfig?.tools?.some(
        tool => tool.toolSpec?.name === 'json',
      ) === true;
    const forcesToolUse = request?.toolConfig?.toolChoice?.any != null;
    const message = error instanceof Error ? error.message : String(error);
    const statusCode =
      typeof error === 'object' &&
      error != null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number'
        ? error.statusCode
        : undefined;
    const providerRejectedForcedToolUse =
      statusCode === 400 &&
      /(tool|tool.?choice|required|forced)/i.test(message);

    if (
      usesSyntheticJsonTool &&
      forcesToolUse &&
      providerRejectedForcedToolUse
    ) {
      console.error(
        'ISSUE_21290_REPRODUCED: Bedrock rejected Opus 5.5 structured output because AI SDK forced the synthetic JSON tool.',
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
