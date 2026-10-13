import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createElevenLabs } from './elevenlabs-provider';

type RecordedResponse = {
  words: Array<{ speaker_id?: string }>;
};

async function loadFixture(filename: string): Promise<RecordedResponse> {
  return JSON.parse(
    await readFile(path.join(__dirname, '__fixtures__', filename), 'utf8'),
  ) as RecordedResponse;
}

describe('issue #22052 diarization default', () => {
  it.each([
    ['empty options', { elevenlabs: {} }, ['speaker_0', 'speaker_1'], ['true']],
    [
      'unrelated option',
      { elevenlabs: { languageCode: 'en' } },
      ['speaker_0', 'speaker_1'],
      ['true'],
    ],
  ])(
    'handles %s',
    async (_name, providerOptions, expectedSpeakerIds, expectedDiarize) => {
      const diarizedResponse = await loadFixture('issue-22052-diarized.json');
      const notDiarizedResponse = await loadFixture(
        'issue-22052-not-diarized.json',
      );
      let sentDiarize: string[] = [];
      const provider = createElevenLabs({
        apiKey: 'test-api-key',
        fetch: async (_url, init) => {
          sentDiarize = (init!.body as FormData).getAll('diarize').map(String);
          return Response.json(
            sentDiarize.at(-1) === 'false'
              ? notDiarizedResponse
              : diarizedResponse,
          );
        },
      });

      const result = await provider.transcription('scribe_v2').doGenerate({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: 'audio/wav',
        providerOptions,
      });
      const response = result.response.body as RecordedResponse;

      expect([
        ...new Set(response.words.map(word => word.speaker_id).filter(Boolean)),
      ]).toEqual(expectedSpeakerIds);
      expect(sentDiarize).toEqual(expectedDiarize);
    },
  );
});
