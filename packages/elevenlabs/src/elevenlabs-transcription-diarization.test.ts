import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';

type TranscriptionFixture = {
  words: Array<{ speaker_id?: string }>;
};

const audio = await readFile(path.join(__dirname, 'transcript-test.mp3'));
const diarizedResponse = JSON.parse(
  await readFile(
    path.join(__dirname, '__fixtures__/issue-22052-diarized.json'),
    'utf8',
  ),
) as TranscriptionFixture;
const notDiarizedResponse = JSON.parse(
  await readFile(
    path.join(__dirname, '__fixtures__/issue-22052-not-diarized.json'),
    'utf8',
  ),
) as TranscriptionFixture;

describe('issue #22052', () => {
  it.each([
    ['an empty options object', {}],
    ['an unrelated languageCode option', { languageCode: 'en' }],
  ])('keeps default diarization with %s', async (_name, options) => {
    const provider = createElevenLabs({
      apiKey: 'test-api-key',
      fetch: async (_url, init) => {
        const formData = init!.body as FormData;
        const lastDiarizeValue = formData.getAll('diarize').at(-1);

        return Response.json(
          lastDiarizeValue === 'true' ? diarizedResponse : notDiarizedResponse,
        );
      },
    });

    const result = await provider.transcription('scribe_v2').doGenerate({
      audio,
      mediaType: 'audio/mpeg',
      providerOptions: { elevenlabs: options },
    });
    const response = result.response.body as TranscriptionFixture;

    expect(response.words.some(word => word.speaker_id != null)).toBe(true);
  });
});
