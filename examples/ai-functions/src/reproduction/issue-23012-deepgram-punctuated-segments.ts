import { createDeepgram } from '@ai-sdk/deepgram';
import assert from 'node:assert/strict';

type ResponseMode = 'plain' | 'formatted' | 'mixed';

let responseMode: ResponseMode = 'plain';

const model = createDeepgram({
  apiKey: 'synthetic',
  fetch: async () => {
    const formatted = responseMode !== 'plain';
    const mixed = responseMode === 'mixed';

    return Response.json({
      metadata: { duration: 1 },
      results: {
        channels: [
          {
            alternatives: [
              {
                transcript: formatted ? 'Hello, world!' : 'hello world',
                words: [
                  {
                    word: 'hello',
                    start: 0,
                    end: 0.4,
                    ...(formatted ? { punctuated_word: 'Hello,' } : {}),
                  },
                  {
                    word: 'world',
                    start: 0.5,
                    end: 1,
                    ...(formatted && !mixed
                      ? { punctuated_word: 'world!' }
                      : {}),
                  },
                ],
              },
            ],
          },
        ],
      },
    });
  },
}).transcription('nova-3');

async function transcribe() {
  return model.doGenerate({
    audio: new Uint8Array([0]),
    mediaType: 'audio/wav',
    providerOptions: {
      deepgram: {
        punctuate: true,
        smartFormat: true,
      },
    },
  });
}

async function main() {
  const plain = await transcribe();
  assert.deepEqual(
    plain.segments,
    [
      { text: 'hello', startSecond: 0, endSecond: 0.4 },
      { text: 'world', startSecond: 0.5, endSecond: 1 },
    ],
    'Unformatted Deepgram words should remain unchanged',
  );

  responseMode = 'formatted';
  const formatted = await transcribe();

  responseMode = 'mixed';
  const mixed = await transcribe();

  const failures: string[] = [];

  if (formatted.text !== 'Hello, world!') {
    throw new Error(
      `REPRODUCTION_HARNESS_ERROR: unexpected transcript ${formatted.text}`,
    );
  }

  if (
    JSON.stringify(
      formatted.segments.map(segment => ({
        text: segment.text,
        startSecond: segment.startSecond,
        endSecond: segment.endSecond,
      })),
    ) !==
    JSON.stringify([
      { text: 'Hello,', startSecond: 0, endSecond: 0.4 },
      { text: 'world!', startSecond: 0.5, endSecond: 1 },
    ])
  ) {
    failures.push(
      `formatted segments were ${JSON.stringify(formatted.segments)}`,
    );
  }

  if (
    JSON.stringify(mixed.segments.map(segment => segment.text)) !==
    JSON.stringify(['Hello,', 'world'])
  ) {
    failures.push(`mixed segments were ${JSON.stringify(mixed.segments)}`);
  }

  if (failures.length > 0) {
    console.error(
      'ISSUE_23012: Deepgram timestamped segments lost punctuated_word formatting\n' +
        failures.map(failure => `- ${failure}`).join('\n'),
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #23012 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
