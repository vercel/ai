import { createGladia } from '@ai-sdk/gladia';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

type Utterance = {
  confidence?: number;
  language?: string;
  speaker?: number | string;
  words?: unknown[];
};

async function main() {
  const fixture = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/gladia/src/__fixtures__/gladia-result-diarization.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );

  let requestBody: unknown;
  const provider = createGladia({
    apiKey: 'test-api-key',
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'https://api.gladia.io/v2/upload') {
        return Response.json({
          audio_url: 'https://api.gladia.io/file/recorded-live-audio',
        });
      }

      if (url === 'https://api.gladia.io/v2/pre-recorded') {
        requestBody = JSON.parse(String(init?.body));
        return Response.json({
          result_url:
            'https://api.gladia.io/v2/pre-recorded/recorded-live-result',
        });
      }

      if (
        url === 'https://api.gladia.io/v2/pre-recorded/recorded-live-result'
      ) {
        return Response.json(fixture);
      }

      throw new Error(`Unexpected request: ${url}`);
    },
  });

  const result = await transcribe({
    model: provider.transcription(),
    audio: new Uint8Array([0]),
    providerOptions: {
      gladia: {
        diarization: true,
        diarizationConfig: {
          numberOfSpeakers: 2,
        },
      },
    },
  });

  const rawUtterances = fixture.result.transcription.utterances as Utterance[];
  const metadataUtterances = (
    result.providerMetadata?.gladia as {
      result?: { transcription?: { utterances?: Utterance[] } };
    }
  )?.result?.transcription?.utterances;

  if (
    !(requestBody as { diarization?: boolean })?.diarization ||
    !rawUtterances.some(utterance => utterance.speaker === 0) ||
    !rawUtterances.some(utterance => utterance.speaker === 1)
  ) {
    throw new Error('The diarization reproduction preconditions were not met.');
  }

  const expectedFields: (keyof Utterance)[] = [
    'speaker',
    'confidence',
    'language',
    'words',
  ];
  const missingFields = expectedFields.filter(
    field => metadataUtterances?.[0]?.[field] == null,
  );

  if (missingFields.length > 0) {
    console.error(
      `ISSUE_20420_REPRODUCED: transcribe() stripped Gladia utterance fields from providerMetadata.gladia: ${missingFields.join(', ')}`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    'Gladia diarization fields are present in transcribe() provider metadata.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
