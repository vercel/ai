import { createGroq } from '@ai-sdk/groq';
import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  let providerResponse:
    | {
        status: number;
        contentType: string | null;
        body: string;
      }
    | undefined;

  const groq = createGroq({
    fetch: async (input, init) => {
      const response = await fetch(input, init);
      providerResponse = {
        status: response.status,
        contentType: response.headers.get('content-type'),
        body: await response.clone().text(),
      };
      return response;
    },
  });

  try {
    const result = await transcribe({
      model: groq.transcription('whisper-large-v3'),
      audio: await readFile('data/galileo.mp3'),
      providerOptions: {
        groq: {
          responseFormat: 'text',
        },
      },
      maxRetries: 0,
    });

    throw new Error(
      `Issue #12118 did not reproduce: AI SDK returned ${JSON.stringify(result.text)}.`,
    );
  } catch (error) {
    if (
      providerResponse?.status === 200 &&
      providerResponse.contentType?.startsWith('text/plain') &&
      providerResponse.body.length > 0 &&
      error instanceof Error &&
      error.message.includes('Invalid JSON response')
    ) {
      console.error(
        'ISSUE_12118_REPRODUCED: Groq returned a successful text/plain transcript, but AI SDK threw "Invalid JSON response".',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  }
}

main();
