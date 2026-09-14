import { createBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { APICallError, generateText } from 'ai';
import { AwsV4Signer } from '../../../../packages/amazon-bedrock/node_modules/aws4fetch';
import 'dotenv/config';

const supportedModelIds = [
  'us.anthropic.claude-opus-4-7',
  'us.anthropic.claude-opus-4-8',
  'us.anthropic.claude-opus-5',
  'us.anthropic.claude-sonnet-5',
] as const;

const unsupportedModelId = 'global.anthropic.claude-sonnet-4-6';

const capturedRequest: {
  body: Record<string, unknown> | undefined;
} = { body: undefined };

function getCapturedRequestBody(): Record<string, unknown> | undefined {
  return capturedRequest.body;
}

const bedrockAnthropic = createBedrockAnthropic({
  fetch: async (input, init) => {
    if (typeof init?.body === 'string') {
      capturedRequest.body = JSON.parse(init.body) as Record<string, unknown>;
    }

    return globalThis.fetch(input, init);
  },
});

function describeError(error: unknown): string {
  if (APICallError.isInstance(error)) {
    return [
      error.message,
      JSON.stringify(error.requestBodyValues),
      error.responseBody,
    ]
      .filter(Boolean)
      .join('\n');
  }

  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}

function isReportedPrimaryFailure(error: unknown): boolean {
  const description = describeError(error);
  return (
    description.includes('prefix_mismatch_behavior') &&
    description.includes('Extra inputs are not permitted')
  );
}

async function callModel(modelId: string) {
  capturedRequest.body = undefined;

  const result = await generateText({
    model: bedrockAnthropic(modelId),
    prompt: 'Reply with OK.',
    maxOutputTokens: 128,
    maxRetries: 0,
    providerOptions: {
      anthropic: {
        thinking: {
          type: 'adaptive',
          blockBinding: {
            prefixMismatchBehavior: 'drop_block',
          },
        },
      },
    },
  });

  return {
    finishReason: result.finishReason,
    requestBody: getCapturedRequestBody(),
    text: result.text,
  };
}

async function callBedrockDirectly(modelId: string) {
  const region = process.env.AWS_REGION;
  if (region == null) {
    throw new Error('AWS_REGION is required for the direct Bedrock comparison');
  }

  const baseUrl =
    process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME ??
    process.env.AWS_ENDPOINT_URL ??
    `https://bedrock-runtime.${region}.amazonaws.com`;
  const url = `${baseUrl.replace(/\/$/, '')}/model/${encodeURIComponent(
    modelId,
  )}/invoke`;
  const body = JSON.stringify({
    anthropic_version: 'bedrock-2023-05-31',
    anthropic_beta: ['thinking-binding-controls-2026-08-01'],
    max_tokens: 128,
    thinking: {
      type: 'adaptive',
      block_binding: {
        mismatch_behavior: 'drop_block',
      },
    },
    messages: [{ role: 'user', content: 'Reply with OK.' }],
  });
  const headers = { 'content-type': 'application/json' };

  const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  let requestInit: RequestInit;

  if (bearerToken) {
    requestInit = {
      method: 'POST',
      headers: {
        ...headers,
        authorization: `Bearer ${bearerToken}`,
      },
      body,
    };
  } else {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    if (accessKeyId == null || secretAccessKey == null) {
      throw new Error(
        'AWS credentials are required for the direct Bedrock comparison',
      );
    }

    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers,
      body,
      region,
      service: 'bedrock',
      accessKeyId,
      secretAccessKey,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    });
    const signed = await signer.sign();
    requestInit = {
      method: signed.method,
      headers: signed.headers,
      body: signed.body,
    };
  }

  const response = await fetch(url, requestInit);
  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct Bedrock request failed with ${response.status}: ${responseBody}`,
    );
  }

  return responseBody;
}

async function main() {
  for (const modelId of supportedModelIds) {
    try {
      const result = await callModel(modelId);
      console.log(
        JSON.stringify({
          modelId,
          outcome: 'success',
          finishReason: result.finishReason,
          text: result.text,
          thinking: result.requestBody?.thinking,
          anthropicBeta: result.requestBody?.anthropic_beta,
        }),
      );
    } catch (error) {
      if (isReportedPrimaryFailure(error)) {
        console.error(
          `ISSUE #20729 REPRODUCED: ${modelId} rejected prefix_mismatch_behavior`,
        );
        console.error(describeError(error));
        process.exitCode = 1;
        return;
      }

      throw error;
    }
  }

  for (const modelId of supportedModelIds) {
    const responseBody = await callBedrockDirectly(modelId);
    console.log(
      JSON.stringify({
        modelId,
        outcome: 'direct-documented-field-success',
        responseType: (JSON.parse(responseBody) as { type?: unknown }).type,
      }),
    );
  }

  try {
    const result = await callModel(unsupportedModelId);
    console.log(
      JSON.stringify({
        modelId: unsupportedModelId,
        outcome: 'unexpected-success',
        finishReason: result.finishReason,
        text: result.text,
        thinking: result.requestBody?.thinking,
        anthropicBeta: result.requestBody?.anthropic_beta,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        modelId: unsupportedModelId,
        outcome: 'rejected-as-model-specific',
        error: describeError(error),
        thinking: getCapturedRequestBody()?.thinking,
        anthropicBeta: getCapturedRequestBody()?.anthropic_beta,
      }),
    );
  }
}

main().catch(error => {
  console.error(describeError(error));
  process.exitCode = 2;
});
