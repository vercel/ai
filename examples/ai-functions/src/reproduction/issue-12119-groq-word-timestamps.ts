import { groq } from '@ai-sdk/groq';
import { transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'node:fs/promises';

type GroqVerboseTranscription = {
  segments?: unknown[];
  words?: unknown[];
};

async function main() {
  const result = await transcribe({
    model: groq.transcription('whisper-large-v3'),
    audio: await readFile('data/galileo.mp3'),
    maxRetries: 0,
    providerOptions: {
      groq: {
        language: 'en',
        responseFormat: 'verbose_json',
        timestampGranularities: ['word'],
      },
    },
  });

  const response = result.responses[0] as
    | ((typeof result.responses)[number] & {
        body?: GroqVerboseTranscription;
      })
    | undefined;
  const body = response?.body;
  const providerWordCount = body?.words?.length ?? 0;
  const providerSegmentCount = body?.segments?.length ?? 0;

  console.log({
    providerWordCount,
    providerSegmentCount,
    aiSdkSegmentCount: result.segments.length,
  });

  if (providerWordCount === 0) {
    throw new Error(
      'ISSUE_12119_PROVIDER_MISMATCH: Groq did not return word timestamps',
    );
  }

  if (result.segments.length === 0) {
    throw new Error(
      'ISSUE_12119_REPRODUCED: Groq returned word timestamps but AI SDK result.segments is empty',
    );
  }
}

main();
