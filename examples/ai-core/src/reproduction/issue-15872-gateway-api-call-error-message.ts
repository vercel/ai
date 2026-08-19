import { GatewayInternalServerError, createGateway } from '@ai-sdk/gateway';
import { APICallError } from '@ai-sdk/provider';
import { generateText } from 'ai';

const gatewayFailureMessage =
  'Service temporarily unavailable. Please try again shortly.';

async function main() {
  const gateway = createGateway({
    apiKey: 'test-api-key',
    baseURL: 'https://gateway.test/v1/ai',
    fetch: async () =>
      new Response(
        JSON.stringify({
          error: {
            message: gatewayFailureMessage,
            type: 'internal_server_error',
          },
        }),
        {
          status: 500,
          headers: { 'content-type': 'application/json' },
        },
      ),
  });

  try {
    await generateText({
      model: gateway('google/gemini-3.1-flash-lite'),
      prompt: 'test',
      maxRetries: 0,
    });
  } catch (error) {
    if (!GatewayInternalServerError.isInstance(error)) {
      throw new Error(
        `Unexpected outer error: ${
          error instanceof Error ? `${error.name}: ${error.message}` : error
        }`,
      );
    }

    if (error.message !== gatewayFailureMessage) {
      throw new Error(`Unexpected gateway error message: ${error.message}`);
    }

    if (!APICallError.isInstance(error.cause)) {
      throw new Error('GatewayInternalServerError cause is not APICallError');
    }

    if (error.cause.message === '[object Object]') {
      console.error(
        'ISSUE_15872_REPRODUCED: nested AI_APICallError message is [object Object] instead of gateway failure details',
      );
      process.exitCode = 1;
      return;
    }

    const includesResponseBody =
      error.cause.responseBody != null &&
      error.cause.message.includes(error.cause.responseBody);

    if (
      !error.cause.message.includes(gatewayFailureMessage) &&
      !includesResponseBody
    ) {
      throw new Error(
        `Nested APICallError still omits gateway failure details: ${error.cause.message}`,
      );
    }

    console.log('Nested APICallError includes useful gateway failure details.');
    return;
  }

  throw new Error('Expected the gateway request to fail');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
