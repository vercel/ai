import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import fs from 'node:fs/promises';

const issueSignal =
  'ISSUE_19403_REPRODUCED: CRIS-prefixed OpenAI request was rejected because AI SDK sent reasoningConfig';

async function main() {
  const liveErrorBody = await fs.readFile(
    '../../packages/amazon-bedrock/src/__fixtures__/amazon-bedrock-openai-cris-reasoning-config-error.json',
    'utf8',
  );
  let capturedRequestBody: any;

  const bedrock = createAmazonBedrock({
    apiKey: 'reproduction-api-key',
    region: 'us-east-1',
    fetch: async (_url, init) => {
      capturedRequestBody = JSON.parse(init!.body as string);

      if (
        capturedRequestBody.additionalModelRequestFields?.reasoningConfig !=
        null
      ) {
        return new Response(liveErrorBody, {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      return Response.json({
        output: {
          message: {
            content: [{ text: 'Hello' }],
            role: 'assistant',
          },
        },
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
    },
  });

  try {
    const result = await generateText({
      model: bedrock('us.openai.gpt-5.6-luna'),
      prompt: 'Explain quantum computing.',
      maxRetries: 0,
      providerOptions: {
        bedrock: {
          reasoningConfig: {
            maxReasoningEffort: 'high',
          },
        },
      },
    });

    if (
      capturedRequestBody.additionalModelRequestFields?.reasoning_effort !==
        'high' ||
      capturedRequestBody.additionalModelRequestFields?.reasoningConfig != null
    ) {
      throw new Error(
        'Expected reasoning_effort without reasoningConfig for the CRIS-prefixed OpenAI model.',
      );
    }

    if (result.text !== 'Hello') {
      throw new Error(
        'Expected the corrected request to complete successfully.',
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Unknown parameter: 'reasoningConfig'")
    ) {
      console.error(issueSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
