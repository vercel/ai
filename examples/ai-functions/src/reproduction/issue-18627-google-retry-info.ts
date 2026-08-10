import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

const retryDelay = '34.4s';

const body = JSON.stringify({
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
      new Response(body, {
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
  } catch (error) {
    if (!APICallError.isInstance(error)) {
      throw error;
    }

    if (error.statusCode !== 429 || error.isRetryable !== true) {
      throw new Error('Expected a retryable 429 APICallError.');
    }

    if (error.responseHeaders?.['retry-after'] !== undefined) {
      throw new Error('Expected the response to omit retry-after.');
    }

    if (!error.responseBody?.includes('google.rpc.RetryInfo')) {
      throw new Error('Expected responseBody to retain google.rpc.RetryInfo.');
    }

    const details = (
      error.data as
        | {
            error?: {
              details?: Array<{ '@type'?: string; retryDelay?: string }>;
            };
          }
        | undefined
    )?.error?.details;
    const retryInfo = details?.find(detail =>
      detail['@type']?.endsWith('google.rpc.RetryInfo'),
    );

    if (retryInfo?.retryDelay !== retryDelay) {
      throw new Error(
        'ISSUE_18627_REPRODUCED: APICallError.data omitted Google RetryInfo retryDelay 34.4s while responseBody retained it.',
      );
    }

    return;
  }

  throw new Error('Expected generateText to throw an APICallError.');
}

main();
