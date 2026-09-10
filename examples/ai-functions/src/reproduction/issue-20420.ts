import { createGladia } from '@ai-sdk/gladia';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

type JsonRecord = Record<string, unknown>;

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

async function main() {
  const fixture = JSON.parse(
    await readFile(
      '../../packages/gladia/src/__fixtures__/gladia-result-diarization.json',
      'utf8',
    ),
  ) as JsonRecord;
  let initiateRequest: JsonRecord | undefined;

  const provider = createGladia({
    apiKey: 'test-api-key',
    fetch: async (input, init) => {
      const url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      const method =
        init?.method ?? (input instanceof Request ? input.method : 'GET');

      if (url === 'https://api.gladia.io/v2/upload') {
        return jsonResponse({
          audio_url: 'https://api.gladia.io/file/reproduction-audio',
        });
      }

      if (
        url === 'https://api.gladia.io/v2/pre-recorded' &&
        method === 'POST'
      ) {
        initiateRequest = JSON.parse(String(init?.body)) as JsonRecord;
        return jsonResponse({
          result_url: 'https://api.gladia.io/v2/pre-recorded/reproduction-job',
        });
      }

      if (url === 'https://api.gladia.io/v2/pre-recorded/reproduction-job') {
        return jsonResponse(fixture);
      }

      throw new Error(`Unexpected request: ${method} ${url}`);
    },
  });

  const result = await transcribe({
    model: provider.transcription(),
    audio: await readFile('../../packages/gladia/src/transcript-test.mp3'),
    providerOptions: {
      gladia: {
        diarization: true,
      },
    },
  });

  if (initiateRequest?.diarization !== true) {
    throw new Error(
      'Reproduction setup failed: diarization was not sent to Gladia.',
    );
  }

  const rawUtterance = (
    (fixture.result as JsonRecord).transcription as JsonRecord
  ).utterances as JsonRecord[];
  const expectedFields = ['speaker', 'confidence', 'language', 'words'];

  for (const field of expectedFields) {
    if (!(field in rawUtterance[0])) {
      throw new Error(
        `Reproduction setup failed: live fixture lacks ${field}.`,
      );
    }
  }

  const metadata = result.providerMetadata?.gladia as JsonRecord;
  const sdkUtterance = (
    ((metadata.result as JsonRecord).transcription as JsonRecord)
      .utterances as JsonRecord[]
  )[0];
  const missingFields = expectedFields.filter(
    field => !(field in sdkUtterance),
  );

  if (missingFields.length > 0) {
    throw new Error(
      `ISSUE_20420: Gladia diarization fields missing from providerMetadata: ${missingFields.join(
        ', ',
      )}`,
    );
  }

  console.log('Gladia diarization fields were retained in providerMetadata.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
