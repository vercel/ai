import { createGladia } from '@ai-sdk/gladia';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  const rawResult = JSON.parse(
    await readFile(
      '../../packages/gladia/src/__fixtures__/gladia-result-diarization.json',
      'utf8',
    ),
  );
  let initiateRequestBody: any;

  const gladia = createGladia({
    apiKey: 'test-api-key',
    fetch: async (input, init) => {
      const url = String(input);

      if (url === 'https://api.gladia.io/v2/upload') {
        return Response.json({
          audio_url: 'https://api.gladia.io/file/reproduction',
        });
      }

      if (
        url === 'https://api.gladia.io/v2/pre-recorded' &&
        init?.method === 'POST'
      ) {
        initiateRequestBody =
          typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        return Response.json({
          result_url:
            'https://api.gladia.io/v2/pre-recorded/reproduction-result',
        });
      }

      if (url === 'https://api.gladia.io/v2/pre-recorded/reproduction-result') {
        return Response.json(rawResult);
      }

      throw new Error(`Unexpected Gladia request: ${init?.method} ${url}`);
    },
  });

  const result = await transcribe({
    model: gladia.transcription(),
    audio: new Uint8Array([0x49, 0x44, 0x33]),
    providerOptions: {
      gladia: {
        diarization: true,
      },
    },
  });

  if (initiateRequestBody?.diarization !== true) {
    throw new Error('Expected the reproduction to request diarization.');
  }

  const rawUtterance = rawResult.result.transcription.utterances[0];
  const publicUtterance = (result.providerMetadata.gladia as any)?.result
    ?.transcription?.utterances?.[0];

  console.log(
    JSON.stringify(
      {
        rawUtteranceFields: {
          speaker: rawUtterance.speaker,
          confidence: rawUtterance.confidence,
          language: rawUtterance.language,
          wordCount: rawUtterance.words.length,
        },
        publicUtteranceKeys: Object.keys(publicUtterance ?? {}),
      },
      null,
      2,
    ),
  );

  const retainedAllFields =
    publicUtterance?.speaker === rawUtterance.speaker &&
    publicUtterance?.confidence === rawUtterance.confidence &&
    publicUtterance?.language === rawUtterance.language &&
    JSON.stringify(publicUtterance?.words) ===
      JSON.stringify(rawUtterance.words);

  if (!retainedAllFields) {
    throw new Error(
      'Reproduced issue #20420: Gladia utterance speaker, confidence, language, or words are missing from provider metadata.',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
