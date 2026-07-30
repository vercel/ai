import { groq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function main() {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  try {
    const result = await transcribe({
      model: groq.transcription('whisper-large-v3'),
      audio: await readFile(
        path.join(
          scriptDirectory,
          '../../../../packages/groq/src/transcript-test.mp3',
        ),
      ),
      providerOptions: {
        groq: {
          language: 'en',
          responseFormat: 'verbose_json',
          timestampGranularities: ['word'],
        },
      },
    });

    if (result.segments.length === 0) {
      throw new Error(
        'ISSUE_12119_REPRODUCED: transcription succeeded but result.segments is empty',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('ISSUE_12119_REPRODUCED')) {
      throw error;
    }
    if (!message.includes('unknown param `timestamp_granularities`')) {
      throw error;
    }

    console.log(
      'ISSUE_12119_NOT_REACHED: Groq rejected the AI SDK request because timestamp_granularities was not encoded as an array field',
    );
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
