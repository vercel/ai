import { createBedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText } from 'ai';
import { AwsV4Signer } from 'aws4fetch';

const beta = 'thinking-binding-controls-2026-08-01';
const supportedModelIds = [
  'global.anthropic.claude-opus-4-7',
  'global.anthropic.claude-opus-4-8',
  'global.anthropic.claude-opus-5',
  'global.anthropic.claude-sonnet-5',
] as const;
const olderModelId = 'global.anthropic.claude-sonnet-4-6';

type RequestResult = {
  body?: unknown;
  error?: {
    message: string;
    responseBody?: string;
    statusCode?: number;
  };
  ok: boolean;
  requestBody: Record<string, unknown>;
  statusCode?: number;
};

function bodyText(body: BodyInit | null | undefined): string | undefined {
  if (typeof body === 'string') {
    return body;
  }
  if (body instanceof Uint8Array) {
    return new TextDecoder().decode(body);
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(body));
  }
  return undefined;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorDetails(error: unknown): RequestResult['error'] {
  const value = error as {
    message?: string;
    responseBody?: string;
    statusCode?: number;
  };

  return {
    message: value?.message ?? String(error),
    responseBody: value?.responseBody,
    statusCode: value?.statusCode,
  };
}

function isFieldMismatch(result: RequestResult): boolean {
  const details = `${result.error?.message ?? ''}\n${
    result.error?.responseBody ?? ''
  }`;
  return (
    result.error?.statusCode === 400 &&
    details.includes('prefix_mismatch_behavior') &&
    details.includes('Extra inputs are not permitted')
  );
}

function isAccessBlocker(result: RequestResult): boolean {
  return [401, 402, 403, 429].includes(result.error?.statusCode ?? 0);
}

async function invokeWithSdk(modelId: string): Promise<RequestResult> {
  let requestBody: Record<string, unknown> = {};
  const provider = createBedrockAnthropic({
    fetch: async (input, init) => {
      const text = bodyText(init?.body);
      if (text != null) {
        requestBody = JSON.parse(text);
      }
      return globalThis.fetch(input, init);
    },
  });

  try {
    const result = await generateText({
      model: provider(modelId),
      maxOutputTokens: 1024,
      maxRetries: 0,
      prompt: 'Reply with exactly OK.',
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
      body: { finishReason: result.finishReason, text: result.text },
      ok: true,
      requestBody,
    };
  } catch (error) {
    return {
      error: errorDetails(error),
      ok: false,
      requestBody,
    };
  }
}

async function invokeDocumentedRequest(
  modelId: string,
): Promise<RequestResult> {
  const region = process.env.AWS_REGION ?? '';
  const baseURL =
    process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME ??
    process.env.AWS_ENDPOINT_URL ??
    `https://bedrock-runtime.${region}.amazonaws.com`;
  const url = `${baseURL.replace(/\/$/, '')}/model/${encodeURIComponent(
    modelId,
  )}/invoke`;
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    anthropic_beta: [beta],
    max_tokens: 1024,
    thinking: {
      type: 'adaptive',
      block_binding: {
        mismatch_behavior: 'drop_block',
      },
    },
    messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
  };
  const body = JSON.stringify(requestBody);
  const baseHeaders: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json',
  };
  const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK?.trim();
  let headers: HeadersInit;

  if (apiKey) {
    headers = { ...baseHeaders, authorization: `Bearer ${apiKey}` };
  } else {
    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: baseHeaders,
      body,
      region,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      sessionToken: process.env.AWS_SESSION_TOKEN,
      service: 'bedrock',
    });
    headers = (await signer.sign()).headers;
  }

  const response = await globalThis.fetch(url, {
    method: 'POST',
    headers,
    body,
  });
  const responseText = await response.text();

  return {
    body: parseJson(responseText),
    error: response.ok
      ? undefined
      : {
          message: `Direct Bedrock request returned ${response.status}`,
          responseBody: responseText,
          statusCode: response.status,
        },
    ok: response.ok,
    requestBody,
    statusCode: response.status,
  };
}

async function main() {
  const results: Array<{
    direct: RequestResult;
    modelId: string;
    sdk: RequestResult;
  }> = [];

  for (const modelId of supportedModelIds) {
    const sdk = await invokeWithSdk(modelId);
    const direct = await invokeDocumentedRequest(modelId);
    results.push({ direct, modelId, sdk });
    console.log(JSON.stringify({ direct, modelId, sdk }));
  }

  const olderSdk = await invokeWithSdk(olderModelId);
  console.log(JSON.stringify({ modelId: olderModelId, sdk: olderSdk }));

  const blockers = results.flatMap(({ direct, modelId, sdk }) =>
    [['SDK', sdk] as const, ['direct', direct] as const]
      .filter(([, result]) => isAccessBlocker(result))
      .map(
        ([kind, result]) => `${modelId} ${kind}: ${result.error?.statusCode}`,
      ),
  );
  if (blockers.length > 0) {
    throw new Error(`LIVE_PROVIDER_BLOCKED: ${blockers.join(', ')}`);
  }

  const reproduced = results.filter(
    ({ direct, sdk }) => isFieldMismatch(sdk) && direct.ok,
  );
  if (reproduced.length > 0) {
    throw new Error(
      `ISSUE_REPRODUCED: Bedrock rejected AI SDK prefix_mismatch_behavior while documented mismatch_behavior succeeded for ${reproduced
        .map(({ modelId }) => modelId)
        .join(', ')}`,
    );
  }

  const unsuccessful = results.filter(
    ({ direct, sdk }) => !sdk.ok || !direct.ok,
  );
  if (unsuccessful.length > 0) {
    throw new Error(
      `UNEXPECTED_LIVE_RESULT: ${unsuccessful
        .map(
          ({ direct, modelId, sdk }) =>
            `${modelId} sdk=${sdk.error?.statusCode ?? 'ok'} direct=${
              direct.error?.statusCode ?? 'ok'
            }`,
        )
        .join(', ')}`,
    );
  }

  for (const { direct, modelId, sdk } of results) {
    const sdkThinking = sdk.requestBody.thinking as
      | {
          block_binding?: Record<string, unknown>;
        }
      | undefined;
    const sdkBetas = sdk.requestBody.anthropic_beta;
    const directThinking = direct.requestBody.thinking as {
      block_binding?: Record<string, unknown>;
    };

    if (
      sdkThinking?.block_binding?.prefix_mismatch_behavior !== 'drop_block' ||
      !Array.isArray(sdkBetas) ||
      !sdkBetas.includes(beta)
    ) {
      throw new Error(`SDK_SCENARIO_NOT_EXERCISED: ${modelId}`);
    }
    if (
      directThinking.block_binding?.mismatch_behavior !== 'drop_block' ||
      !direct.ok
    ) {
      throw new Error(`DOCUMENTED_COMPARISON_FAILED: ${modelId}`);
    }
  }

  console.log(
    `PRIMARY_OUTCOME_SUCCEEDED: ${supportedModelIds.length} supported Bedrock models returned successful text for the configured AI SDK block binding request.`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
