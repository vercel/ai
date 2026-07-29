import { createGroq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

type GroqVerboseTranscription = {
  text: string;
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  segments?: unknown[];
};

async function main() {
  const providerResponse = JSON.parse(
    await readFile(
      path.join(
        process.cwd(),
        '../../packages/groq/src/__fixtures__/groq-transcription-word-timestamps.json',
      ),
      'utf8',
    ),
  ) as GroqVerboseTranscription;

  const groq = createGroq({
    apiKey: 'reproduction-api-key',
    fetch: async () =>
      new Response(JSON.stringify(providerResponse), {
        headers: { 'content-type': 'application/json' },
      }),
  });

  const result = await transcribe({
    model: groq.transcription('whisper-large-v3'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      groq: {
        language: 'en',
        responseFormat: 'verbose_json',
        timestampGranularities: ['word'],
      },
    },
  });

  const words = providerResponse.words ?? [];

  console.log(
    JSON.stringify(
      {
        providerWordCount: words.length,
        providerSegmentCount: providerResponse.segments?.length ?? 0,
        sdkSegmentCount: result.segments.length,
        responseBodyExposed: 'body' in result.responses[0],
      },
      null,
      2,
    ),
  );

  if (words.length === 0) {
    throw new Error(
      'Groq did not return timestamped words for the reported request.',
    );
  }

  if (result.segments.length === 0) {
    throw new Error(
      'ISSUE_12119: Groq returned timestamped words but AI SDK result.segments is empty',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
