import { createDeepgram } from '@ai-sdk/deepgram';
import { experimental_transcribe as transcribe } from 'ai';
import assert from 'node:assert/strict';

const expectedQueryParameters = {
  intents: 'true',
  keyterm: 'galileo',
  paragraphs: 'true',
  replace: 'galileo:Galileo',
  sentiment: 'true',
};

async function main() {
  let requestUrl: string | undefined;

  const deepgram = createDeepgram({
    apiKey: 'test-api-key',
    fetch: async input => {
      requestUrl = input instanceof Request ? input.url : String(input);

      return new Response(
        JSON.stringify({
          metadata: { duration: 1 },
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: 'Galileo',
                    words: [{ word: 'Galileo', start: 0, end: 1 }],
                  },
                ],
              },
            ],
          },
        }),
        {
          headers: { 'content-type': 'application/json' },
          status: 200,
        },
      );
    },
  });

  const result = await transcribe({
    model: deepgram.transcription('nova-3'),
    audio: new Uint8Array([0]),
    providerOptions: {
      deepgram: {
        intents: true,
        keyterm: 'galileo',
        paragraphs: true,
        replace: 'galileo:Galileo',
        sentiment: true,
      },
    },
  });

  assert.equal(result.text, 'Galileo');
  assert.ok(requestUrl, 'Deepgram request was not made');

  const searchParams = new URL(requestUrl).searchParams;
  for (const [name, expectedValue] of Object.entries(expectedQueryParameters)) {
    assert.equal(
      searchParams.get(name),
      expectedValue,
      `Expected ${name}=${expectedValue} in ${requestUrl}`,
    );
  }

  console.log(
    'Issue #16910 could not be reproduced: all five Deepgram transcription options were sent as query parameters.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
