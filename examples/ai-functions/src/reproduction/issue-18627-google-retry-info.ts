import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

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

function getRetryDelay(data: unknown): string | undefined {
  if (data == null || typeof data !== 'object' || !('error' in data)) {
    return undefined;
  }

  const error = data.error;
  if (
    error == null ||
    typeof error !== 'object' ||
    !('details' in error) ||
    !Array.isArray(error.details)
  ) {
    return undefined;
  }

  const retryInfo = error.details.find(
    detail =>
      detail != null &&
      typeof detail === 'object' &&
      '@type' in detail &&
      detail['@type'] === 'type.googleapis.com/google.rpc.RetryInfo',
  );

  return retryInfo != null &&
    typeof retryInfo === 'object' &&
    'retryDelay' in retryInfo &&
    typeof retryInfo.retryDelay === 'string'
    ? retryInfo.retryDelay
    : undefined;
}

async function main() {
  let requestCount = 0;
  const google = createGoogleGenerativeAI({
    apiKey: 'stub-api-key',
    fetch: async () => {
      requestCount++;
      return new Response(responseBody, {
        status: 429,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  try {
    await generateText({
      model: google('gemini-2.5-flash'),
      prompt: 'hi',
      maxRetries: 0,
    });
    throw new Error(
      'Expected the stubbed Gemini request to fail with HTTP 429.',
    );
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    const dataRetryDelay = getRetryDelay(error.data);
    const rawBodyHasRetryInfo =
      error.responseBody?.includes('google.rpc.RetryInfo') === true;

    console.log(
      JSON.stringify(
        {
          requestCount,
          statusCode: error.statusCode,
          isRetryable: error.isRetryable,
          retryAfterHeader: error.responseHeaders?.['retry-after'] ?? null,
          retryAfterMsHeader: error.responseHeaders?.['retry-after-ms'] ?? null,
          dataRetryDelay,
          rawBodyHasRetryInfo,
          data: error.data,
        },
        null,
        2,
      ),
    );

    if (!rawBodyHasRetryInfo) {
      throw new Error(
        'Reproduction setup error: the raw Gemini response body did not contain RetryInfo.',
      );
    }

    if (dataRetryDelay !== retryDelay) {
      throw new Error(
        'Issue #18627 reproduced: APICallError.data dropped Gemini google.rpc.RetryInfo retryDelay "34.4s".',
      );
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
