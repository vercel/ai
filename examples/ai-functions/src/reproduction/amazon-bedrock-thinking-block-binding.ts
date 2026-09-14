import { createAmazonBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText } from 'ai';
import 'dotenv/config';
import { createSigV4FetchFunction } from '../../../../packages/amazon-bedrock/src/amazon-bedrock-sigv4-fetch';

const region = process.env.AWS_REGION ?? 'us-east-1';
const supportedModelIds = [
  'us.anthropic.claude-opus-4-7',
  'us.anthropic.claude-opus-4-8',
  'us.anthropic.claude-opus-5',
  'us.anthropic.claude-sonnet-5',
] as const;
const olderModelId = 'global.anthropic.claude-sonnet-4-6';

type CapturedRequest = {
  body: Record<string, unknown>;
  status: number;
};

const capturedSdkRequests = new Map<string, CapturedRequest>();

function getModelId(input: RequestInfo | URL): string {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const match = url.match(/\/model\/([^/]+)\/invoke$/);

  if (match == null) {
    throw new Error(`Unexpected Bedrock request URL: ${url}`);
  }

  return decodeURIComponent(match[1]);
}

function getRequestBody(init?: RequestInit): Record<string, unknown> {
  if (typeof init?.body !== 'string') {
    throw new Error('Expected the Bedrock request body to be a JSON string.');
  }

  return JSON.parse(init.body) as Record<string, unknown>;
}

const bedrock = createAmazonBedrockAnthropic({
  region,
  fetch: async (input, init) => {
    const response = await globalThis.fetch(input, init);
    capturedSdkRequests.set(getModelId(input), {
      body: getRequestBody(init),
      status: response.status,
    });
    return response;
  },
});

function createDirectFetch(): typeof globalThis.fetch {
  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();

  if (apiKey) {
    return (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('authorization', `Bearer ${apiKey}`);

      return globalThis.fetch(input, {
        ...init,
        headers,
      });
    };
  }

  return createSigV4FetchFunction(() => ({
    region,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  }));
}

async function invokeDirectlyWithDocumentedField(modelId: string) {
  const directFetch = createDirectFetch();
  const response = await directFetch(
    `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        anthropic_beta: ['thinking-binding-controls-2026-08-01'],
        max_tokens: 1024,
        thinking: {
          type: 'adaptive',
          block_binding: {
            mismatch_behavior: 'drop_block',
          },
        },
        messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      }),
    },
  );
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Direct documented request failed for ${modelId} with HTTP ${response.status}: ${responseText}`,
    );
  }

  console.log(`direct ${modelId}: HTTP ${response.status}`);
}

async function invokeThroughSdk(modelId: string) {
  try {
    const result = await generateText({
      model: bedrock(modelId),
      prompt: 'Reply with exactly OK.',
      maxOutputTokens: 1024,
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
    const request = capturedSdkRequests.get(modelId);

    if (request == null) {
      throw new Error(`Did not capture the SDK request for ${modelId}.`);
    }

    const thinking = request.body.thinking as
      | {
          block_binding?: Record<string, unknown>;
        }
      | undefined;
    const fieldNames = Object.keys(thinking?.block_binding ?? {});
    const betas = request.body.anthropic_beta;

    console.log(
      `sdk ${modelId}: HTTP ${request.status}, text=${JSON.stringify(result.text)}, block_binding fields=${fieldNames.join(',')}, betas=${JSON.stringify(betas)}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    if (
      message.includes(
        'thinking.adaptive.block_binding.prefix_mismatch_behavior: Extra inputs are not permitted',
      )
    ) {
      console.error(`ISSUE_REPRODUCED: ${message}`);
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

async function verifyOlderModelCondition() {
  try {
    await invokeThroughSdk(olderModelId);
    console.log(
      `older ${olderModelId}: unexpectedly accepted thinking.block_binding`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`older ${olderModelId}: rejected block_binding: ${message}`);
  }
}

async function main() {
  for (const modelId of supportedModelIds) {
    await invokeThroughSdk(modelId);
    if (process.exitCode === 1) {
      return;
    }
  }

  for (const modelId of supportedModelIds) {
    await invokeDirectlyWithDocumentedField(modelId);
  }

  await verifyOlderModelCondition();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
