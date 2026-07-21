import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText, rerank } from 'ai';

const modelId = 'anthropic.claude-3-haiku-20240307-v1:0';

function createCapturingFetch(urls: string[]) {
  return async (input: RequestInfo | URL): Promise<Response> => {
    urls.push(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    throw new TypeError('Request intentionally stopped after URL capture.');
  };
}

async function captureRuntimeUrl(options: {
  region: string;
  baseURL?: string;
}) {
  const urls: string[] = [];
  const provider = createAmazonBedrock({
    ...options,
    apiKey: 'reproduction-api-key',
    fetch: createCapturingFetch(urls),
  });

  try {
    await generateText({
      model: provider(modelId),
      prompt: 'Reply with OK.',
      maxRetries: 0,
    });
  } catch {
    // The request is intentionally stopped after the provider selects its URL.
  }

  if (urls.length !== 1) {
    throw new Error(`Expected one Runtime request, observed ${urls.length}.`);
  }

  return urls[0];
}

async function captureAgentRuntimeUrl(baseURL: string) {
  const urls: string[] = [];
  const provider = createAmazonBedrock({
    region: 'us-east-1',
    baseURL,
    apiKey: 'reproduction-api-key',
    fetch: createCapturingFetch(urls),
  });

  try {
    await rerank({
      model: provider.reranking('amazon.rerank-v1:0'),
      documents: ['first', 'second'],
      query: 'first',
      topN: 1,
      maxRetries: 0,
    });
  } catch {
    // The request is intentionally stopped after the provider selects its URL.
  }

  if (urls.length !== 1) {
    throw new Error(
      `Expected one Agent Runtime request, observed ${urls.length}.`,
    );
  }

  return urls[0];
}

async function main() {
  const expectedIsoUrl =
    'https://bedrock-runtime.us-iso-east-1.c2s.ic.gov/model/anthropic.claude-3-haiku-20240307-v1%3A0/converse';
  const observedIsoUrl = await captureRuntimeUrl({
    region: 'us-iso-east-1',
  });

  const previousRuntimeOverride = process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;
  process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME =
    'https://runtime-override.example.test';
  let observedEnvironmentOverrideUrl: string;
  try {
    observedEnvironmentOverrideUrl = await captureRuntimeUrl({
      region: 'us-east-1',
    });
  } finally {
    if (previousRuntimeOverride == null) {
      delete process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME;
    } else {
      process.env.AWS_ENDPOINT_URL_BEDROCK_RUNTIME = previousRuntimeOverride;
    }
  }

  const sharedBaseURL = 'https://bedrock-runtime.us-east-1.amazonaws.com';
  const observedRuntimeBaseUrl = await captureRuntimeUrl({
    region: 'us-east-1',
    baseURL: sharedBaseURL,
  });
  const observedAgentRuntimeBaseUrl =
    await captureAgentRuntimeUrl(sharedBaseURL);

  console.log(
    JSON.stringify(
      {
        nonstandardRegion: {
          expected: expectedIsoUrl,
          observed: observedIsoUrl,
        },
        serviceSpecificEnvironmentOverride: {
          configured:
            'https://runtime-override.example.test/model/anthropic.claude-3-haiku-20240307-v1%3A0/converse',
          observed: observedEnvironmentOverrideUrl,
        },
        sharedBaseURL: {
          runtime: observedRuntimeBaseUrl,
          agentRuntime: observedAgentRuntimeBaseUrl,
        },
      },
      null,
      2,
    ),
  );

  if (observedIsoUrl !== expectedIsoUrl) {
    throw new Error(
      `ISSUE_11197_REPRODUCED: us-iso-east-1 resolved to ${observedIsoUrl} instead of ${expectedIsoUrl}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
