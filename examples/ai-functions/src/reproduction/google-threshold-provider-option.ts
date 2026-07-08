import { createGoogle } from '@ai-sdk/google';
import { generateText } from 'ai';
import { readFileSync } from 'node:fs';

const expectedSafetySettings = [
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    threshold: 'BLOCK_NONE',
  },
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    threshold: 'BLOCK_NONE',
  },
];

type GoogleThresholdFixture = {
  response: {
    body: unknown;
  };
};

async function main() {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/google/src/__fixtures__/google-threshold-live.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as GoogleThresholdFixture;

  let capturedRequestBody: unknown;
  const google = createGoogle({
    apiKey: 'test-api-key',
    fetch: async (_input, init) => {
      capturedRequestBody = JSON.parse(String(init?.body));

      return new Response(JSON.stringify(fixture.response.body), {
        status: 200,
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });

  await generateText({
    model: google('gemini-2.5-flash'),
    prompt: 'Reply with exactly OK.',
    providerOptions: {
      google: {
        threshold: 'BLOCK_NONE',
      },
    },
  });

  const actualSafetySettings =
    capturedRequestBody != null &&
    typeof capturedRequestBody === 'object' &&
    'safetySettings' in capturedRequestBody
      ? capturedRequestBody.safetySettings
      : undefined;

  if (
    JSON.stringify(actualSafetySettings) !==
    JSON.stringify(expectedSafetySettings)
  ) {
    console.error('Expected standalone google.threshold to expand to:');
    console.error(JSON.stringify(expectedSafetySettings, null, 2));
    console.error('Actual request body was:');
    console.error(JSON.stringify(capturedRequestBody, null, 2));
    throw new Error('standalone google.threshold was not sent to Google');
  }

  console.log('Standalone google.threshold was expanded into safetySettings.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
