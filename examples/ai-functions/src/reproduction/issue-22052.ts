import { createElevenLabs } from '@ai-sdk/elevenlabs';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

type RecordedResponse = {
  words: Array<{ speaker_id?: string }>;
};

const fixtureDirectory = new URL(
  '../../../../packages/elevenlabs/src/__fixtures__/',
  import.meta.url,
);

async function loadFixture(filename: string): Promise<RecordedResponse> {
  return JSON.parse(
    await readFile(new URL(filename, fixtureDirectory), 'utf8'),
  ) as RecordedResponse;
}

async function runScenario(
  diarizedResponse: RecordedResponse,
  notDiarizedResponse: RecordedResponse,
  providerOptions:
    | {
        elevenlabs: {
          diarize?: boolean;
          languageCode?: string;
        };
      }
    | undefined,
) {
  let sentDiarize: string[] = [];
  let providerResponse: RecordedResponse | undefined;
  const elevenlabs = createElevenLabs({
    apiKey: 'reproduction-key',
    fetch: async (_url, init) => {
      sentDiarize = (init!.body as FormData).getAll('diarize').map(String);
      providerResponse =
        sentDiarize.at(-1) === 'false' ? notDiarizedResponse : diarizedResponse;
      return Response.json(providerResponse);
    },
  });

  await transcribe({
    model: elevenlabs.transcription('scribe_v2'),
    audio: new Uint8Array([1, 2, 3]),
    providerOptions,
  });

  return {
    sentDiarize,
    speakerIds: [
      ...new Set(
        providerResponse?.words
          .map(word => word.speaker_id)
          .filter((speakerId): speakerId is string => speakerId != null),
      ),
    ],
  };
}

async function main() {
  const [diarizedResponse, notDiarizedResponse] = await Promise.all([
    loadFixture('issue-22052-diarized.json'),
    loadFixture('issue-22052-not-diarized.json'),
  ]);
  const baseline = await runScenario(
    diarizedResponse,
    notDiarizedResponse,
    undefined,
  );
  const withEmptyOptions = await runScenario(
    diarizedResponse,
    notDiarizedResponse,
    { elevenlabs: {} },
  );
  const withLanguageCode = await runScenario(
    diarizedResponse,
    notDiarizedResponse,
    {
      elevenlabs: { languageCode: 'en' },
    },
  );
  const explicitlyDisabled = await runScenario(
    diarizedResponse,
    notDiarizedResponse,
    { elevenlabs: { diarize: false } },
  );

  console.log(
    JSON.stringify(
      {
        baseline,
        withEmptyOptions,
        withLanguageCode,
        explicitlyDisabled,
      },
      null,
      2,
    ),
  );

  if (baseline.speakerIds.length !== 2) {
    throw new Error(
      'Reproduction precondition failed: baseline was not diarized',
    );
  }

  if (
    withEmptyOptions.speakerIds.length !== 2 ||
    withLanguageCode.speakerIds.length !== 2
  ) {
    throw new Error(
      'Issue 22052: unrelated ElevenLabs provider options removed speaker labels despite diarization defaulting to true',
    );
  }

  if (explicitlyDisabled.speakerIds.length !== 0) {
    throw new Error('Explicit diarize=false did not disable speaker labels');
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
