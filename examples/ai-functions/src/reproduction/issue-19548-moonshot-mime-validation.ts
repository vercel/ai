import { createMoonshotAI } from '@ai-sdk/moonshotai';
import { APICallError, generateText, UnsupportedFunctionalityError } from 'ai';

const failureSignal =
  'ISSUE #19548 REPRODUCED: unsupported image/svg+xml was sent to Moonshot instead of being rejected locally';

async function main() {
  let fetchCalls = 0;
  let requestBody = '';

  const provider = createMoonshotAI({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      fetchCalls++;
      requestBody = String(init?.body);

      return new Response(
        JSON.stringify({
          error: {
            message:
              'Invalid request: unsupported image format: text/plain; charset=utf-8',
            type: 'invalid_request_error',
          },
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  });

  try {
    await generateText({
      model: provider('kimi-k3'),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image.' },
            {
              type: 'file',
              data: new TextEncoder().encode(
                '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
              ),
              mediaType: 'image/svg+xml',
            },
          ],
        },
      ],
    });
  } catch (error) {
    if (UnsupportedFunctionalityError.isInstance(error)) {
      if (fetchCalls !== 0) {
        throw new Error(
          `UnsupportedFunctionalityError was raised after ${fetchCalls} provider request(s).`,
        );
      }

      console.log(
        'Issue fixed: unsupported image/svg+xml was rejected locally before any provider request.',
      );
      return;
    }

    if (
      APICallError.isInstance(error) &&
      fetchCalls === 1 &&
      requestBody.includes('data:image/svg+xml;base64,')
    ) {
      console.error(failureSignal);
      process.exitCode = 1;
      return;
    }

    throw error;
  }

  throw new Error(
    'Expected unsupported image/svg+xml to raise UnsupportedFunctionalityError.',
  );
}

main();
