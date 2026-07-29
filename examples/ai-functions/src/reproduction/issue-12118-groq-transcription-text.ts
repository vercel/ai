import { groq } from '@ai-sdk/groq';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';

async function main() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is required');
  }

  const audio = await readFile('../../packages/groq/src/transcript-test.mp3');
  const directFormData = new FormData();
  directFormData.append('model', 'whisper-large-v3');
  directFormData.append('response_format', 'text');
  directFormData.append(
    'file',
    new File([audio], 'audio.mp3', { type: 'audio/mpeg' }),
  );

  const directResponse = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: directFormData,
    },
  );
  const directBody = await directResponse.text();

  console.log(
    `Direct Groq response: status=${directResponse.status} content-type=${directResponse.headers.get('content-type')} body=${JSON.stringify(directBody)}`,
  );

  if (!directResponse.ok) {
    throw new Error(
      `Direct Groq request failed with HTTP ${directResponse.status}`,
    );
  }

  const result = await transcribe({
    model: groq.transcription('whisper-large-v3'),
    audio,
    maxRetries: 0,
    providerOptions: {
      groq: {
        responseFormat: 'text',
      },
    },
  });

  console.log(`AI SDK transcription: ${JSON.stringify(result.text)}`);
}

main();
