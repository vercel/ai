import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const samplingCases = [
  {
    apiName: 'temperature',
    feature: 'temperature',
    options: { temperature: 0 },
  },
  { apiName: 'top_p', feature: 'topP', options: { topP: 0.9 } },
  { apiName: 'top_k', feature: 'topK', options: { topK: 10 } },
] as const;

async function main() {
  let lastRequestBody: {
    inferenceConfig?: Record<string, unknown>;
  } = {};
  const bedrock = createAmazonBedrock({
    fetch: async (input, init) => {
      lastRequestBody = JSON.parse(String(init?.body));
      return fetch(input, init);
    },
  });

  const control = await generateText({
    model: bedrock('global.anthropic.claude-opus-5'),
    prompt: 'Say OK',
  });

  if (control.text.trim().length === 0) {
    throw new Error('Expected the control request to return non-empty text.');
  }

  const rejectedFeatures: string[] = [];

  for (const { apiName, feature, options } of samplingCases) {
    try {
      const result = await generateText({
        model: bedrock('global.anthropic.claude-opus-5'),
        prompt: 'Say OK',
        ...options,
      });

      const samplingWarning = result.warnings?.find(
        warning =>
          warning.type === 'unsupported' && warning.feature === feature,
      );

      if (samplingWarning == null) {
        if (lastRequestBody.inferenceConfig?.[feature] == null) {
          throw new Error(
            `Expected an unsupported warning for the omitted ${feature} parameter.`,
          );
        }
      }

      if (result.text.trim().length === 0) {
        throw new Error(
          `Expected the ${feature} request to return non-empty text.`,
        );
      }
    } catch (error) {
      const apiError = error as {
        message?: unknown;
        statusCode?: unknown;
      };
      const message =
        typeof apiError.message === 'string' ? apiError.message : String(error);

      if (
        apiError.statusCode === 400 &&
        message.toLowerCase().includes(apiName) &&
        message.toLowerCase().includes('deprecated')
      ) {
        rejectedFeatures.push(feature);
        continue;
      }

      throw error;
    }
  }

  if (rejectedFeatures.length > 0) {
    console.error(
      `ISSUE_21380_REPRODUCED: Bedrock rejected forwarded sampling parameters: ${rejectedFeatures.join(', ')}.`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
