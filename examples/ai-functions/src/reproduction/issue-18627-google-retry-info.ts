import { generateText } from '../../../../packages/ai/src';
import { createGoogleGenerativeAI } from '../../../../packages/google/src';
import { APICallError } from '../../../../packages/provider/src';

const retryDelay = '34.4s';

const responseBody = JSON.stringify({
  error: {
    code: 429,
    message: 'You exceeded your current quota, please check your plan.',
    status: 'RESOURCE_EXHAUSTED',
    details: [
      {
        '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
        violations: [
          {
            quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier',
          },
        ],
      },
      {
        '@type': 'type.googleapis.com/google.rpc.RetryInfo',
        retryDelay,
      },
    ],
  },
});

async function main() {
  const google = createGoogleGenerativeAI({
    apiKey: 'test-api-key',
    fetch: async () =>
      new Response(responseBody, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
  });

  try {
    await generateText({
      model: google('gemini-2.5-flash'),
      prompt: 'hi',
      maxRetries: 0,
    });

    throw new Error(
      'Expected the stubbed Google request to fail with HTTP 429.',
    );
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    if (
      error.statusCode !== 429 ||
      error.isRetryable !== true ||
      error.responseHeaders?.['retry-after'] !== undefined ||
      !error.responseBody?.includes('google.rpc.RetryInfo') ||
      !error.responseBody.includes(`"retryDelay":"${retryDelay}"`)
    ) {
      throw new Error(
        'The stub did not produce the reported retryable Google 429 response.',
      );
    }

    const data = error.data as
      | {
          error?: {
            details?: Array<{ '@type'?: string; retryDelay?: string }>;
          };
        }
      | undefined;
    const retryInfo = data?.error?.details?.find(detail =>
      detail['@type']?.endsWith('google.rpc.RetryInfo'),
    );

    if (retryInfo?.retryDelay !== retryDelay) {
      throw new Error(
        'ISSUE_18627_REPRODUCED: APICallError.data omitted Google RetryInfo retryDelay 34.4s while responseBody retained it.',
      );
    }
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
