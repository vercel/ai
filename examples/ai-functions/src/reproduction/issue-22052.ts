import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

type TranscriptionResponse = {
  words: Array<{ speaker_id?: string }>;
};

const fixtureUrl = (name: string) =>
  new URL(
    `../../../../packages/elevenlabs/src/__fixtures__/${name}.json`,
    import.meta.url,
  );

async function readFixture(name: string): Promise<TranscriptionResponse> {
  return JSON.parse(await readFile(fixtureUrl(name), 'utf8'));
}

async function main() {
  const [audio, diarizedResponse, notDiarizedResponse] = await Promise.all([
    readFile(
      new URL(
        '../../../../packages/elevenlabs/src/transcript-test.mp3',
        import.meta.url,
      ),
    ),
    readFixture('issue-22052-diarized'),
    readFixture('issue-22052-not-diarized'),
  ]);
  const sentDiarizeValues: Record<string, string[]> = {};
  let activeCase = '';

  const elevenlabs = createElevenLabs({
    apiKey: 'test-api-key',
    fetch: async (_url, init) => {
      const formData = init!.body as FormData;
      const values = formData.getAll('diarize').map(String);
      sentDiarizeValues[activeCase] = values;

      return Response.json(
        values.at(-1) === 'true' ? diarizedResponse : notDiarizedResponse,
      );
    },
  });

  const cases = [
    { name: 'baseline', providerOptions: undefined },
    {
      name: 'empty',
      providerOptions: { elevenlabs: {} },
    },
    {
      name: 'languageCode',
      providerOptions: { elevenlabs: { languageCode: 'en' } },
    },
  ] as const;
  const speakerLabels: Record<string, boolean> = {};

  for (const testCase of cases) {
    activeCase = testCase.name;
    const result = await transcribe({
      model: elevenlabs.transcription('scribe_v2'),
      audio,
      providerOptions: testCase.providerOptions,
    });
    const body = (
      result.responses[0] as unknown as { body: TranscriptionResponse }
    ).body;
    speakerLabels[testCase.name] = body.words.some(
      word => word.speaker_id != null,
    );
  }

  if (!speakerLabels.baseline) {
    throw new Error('Baseline request did not produce speaker labels.');
  }

  const affectedCases = ['empty', 'languageCode'].filter(
    name => !speakerLabels[name],
  );

  console.log(
    JSON.stringify({ sentDiarizeValues, speakerLabels }, undefined, 2),
  );

  if (affectedCases.length > 0) {
    console.error(
      'Issue #22052 reproduced: default diarization lost speaker labels when ElevenLabs provider options were supplied.',
    );
    process.exitCode = 1;
  }
}

main();
