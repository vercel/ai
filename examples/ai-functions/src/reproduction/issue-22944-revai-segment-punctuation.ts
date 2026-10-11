import { createRevai } from '@ai-sdk/revai';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const transcriptFixtureUrl = new URL(
  '../../../../packages/revai/src/__fixtures__/revai-transcript.json',
  import.meta.url,
);

class ReproducedBugError extends Error {}

async function main() {
  const transcript = JSON.parse(await readFile(transcriptFixtureUrl, 'utf8'));
  const provider = createRevai({
    apiKey: 'fixture',
    fetch: async (url, init) => {
      if (init?.method === 'POST') {
        return Response.json({
          id: 'fixture-job',
          status: 'in_progress',
          language: 'en',
        });
      }

      return Response.json(
        String(url).endsWith('/transcript')
          ? transcript
          : { id: 'fixture-job', status: 'transcribed', language: 'en' },
      );
    },
  });

  const result = await provider.transcription('machine').doGenerate({
    audio: new Uint8Array([0]),
    mediaType: 'audio/wav',
  });

  assert.equal(result.text, 'Hello from the Sal, A-I-S-D-K.');
  assert.deepEqual(
    result.segments.map(segment => [segment.startSecond, segment.endSecond]),
    [
      [0.075, 0.425],
      [0.425, 0.665],
      [0.665, 0.785],
      [0.945, 1.105],
      [1.185, 2.145],
    ],
  );

  const segmentTexts = result.segments.map(segment => segment.text);
  const expectedSegmentTexts = ['Hello', 'from', 'the', 'Sal,', 'A-I-S-D-K.'];
  const buggySegmentTexts = ['Hello', 'from', 'the', 'Sal', ', A-I-S-D-K'];

  if (JSON.stringify(segmentTexts) === JSON.stringify(buggySegmentTexts)) {
    throw new ReproducedBugError(
      `ISSUE_22944_REPRODUCED: Rev.ai segment punctuation is shifted or dropped: ${JSON.stringify(segmentTexts)}`,
    );
  }

  assert.deepEqual(segmentTexts, expectedSegmentTexts);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
