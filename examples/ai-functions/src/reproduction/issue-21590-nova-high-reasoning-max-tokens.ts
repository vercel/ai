import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { APICallError, streamText } from 'ai';

const modelId = 'us.amazon.nova-2-lite-v1:0';
const expectedProviderMessage =
  "`maxTokens` must be unset when reasoningConfig type is 'enabled' and maxReasoningEffort is 'high'";

type ScenarioResult = {
  error?: unknown;
  requestBody: unknown;
  responseBody?: string;
  warnings: unknown;
};

async function runScenario({
  reasoning,
  maxOutputTokens,
}: {
  reasoning: 'medium' | 'high';
  maxOutputTokens?: number;
}): Promise<ScenarioResult> {
  let requestBody: unknown;
  let responseBody: string | undefined;
  const bedrock = createAmazonBedrock({
    region: 'us-east-1',
    apiKey: process.env.AWS_BEARER_TOKEN_BEDROCK,
    fetch: async (input, init) => {
      requestBody = JSON.parse(String(init?.body));
      const response = await fetch(input, init);
      if (!response.ok) {
        responseBody = await response.clone().text();
      }
      return response;
    },
  });

  const result = streamText({
    model: bedrock(modelId),
    prompt: 'Reply with the single word ok.',
    reasoning,
    maxOutputTokens,
    maxRetries: 0,
    onError: () => {},
  });

  let error: unknown;
  for await (const part of result.fullStream) {
    if (part.type === 'error') {
      error = part.error;
    }
  }

  let warnings: unknown;
  try {
    warnings = await result.warnings;
  } catch (warningsError) {
    if (error == null) {
      throw warningsError;
    }
    warnings = [];
  }

  return {
    error,
    requestBody,
    responseBody,
    warnings,
  };
}

async function main() {
  const mediumWithMaxTokens = await runScenario({
    reasoning: 'medium',
    maxOutputTokens: 1024,
  });
  if (mediumWithMaxTokens.error != null) {
    throw new Error('The medium-reasoning control failed.', {
      cause: mediumWithMaxTokens.error,
    });
  }

  const highWithoutMaxTokens = await runScenario({ reasoning: 'high' });
  if (highWithoutMaxTokens.error != null) {
    throw new Error(
      'The high-reasoning control without maxOutputTokens failed.',
      {
        cause: highWithoutMaxTokens.error,
      },
    );
  }

  const highWithMaxTokens = await runScenario({
    reasoning: 'high',
    maxOutputTokens: 1024,
  });

  if (
    APICallError.isInstance(highWithMaxTokens.error) &&
    highWithMaxTokens.error.statusCode === 400 &&
    highWithMaxTokens.error.message.includes(expectedProviderMessage)
  ) {
    console.error(
      'ISSUE_21590_REPRODUCED: Nova 2 Lite high reasoning fails because the AI SDK sends inferenceConfig.maxTokens.',
    );
    console.error(
      JSON.stringify({
        requestBody: highWithMaxTokens.requestBody,
        responseBody: highWithMaxTokens.responseBody,
        warnings: highWithMaxTokens.warnings,
      }),
    );
    process.exitCode = 1;
    return;
  }

  if (
    highWithMaxTokens.error != null ||
    highWithMaxTokens.requestBody == null ||
    typeof highWithMaxTokens.requestBody !== 'object'
  ) {
    throw new Error('The high-reasoning reproduction failed unexpectedly.', {
      cause: highWithMaxTokens.error,
    });
  }

  console.log('Issue #21590 did not reproduce.');
  console.log(
    JSON.stringify({
      controls: {
        mediumWithMaxTokens: {
          requestBody: mediumWithMaxTokens.requestBody,
          warnings: mediumWithMaxTokens.warnings,
        },
        highWithoutMaxTokens: {
          requestBody: highWithoutMaxTokens.requestBody,
          warnings: highWithoutMaxTokens.warnings,
        },
      },
      highWithMaxTokens: {
        requestBody: highWithMaxTokens.requestBody,
        warnings: highWithMaxTokens.warnings,
      },
    }),
  );
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
