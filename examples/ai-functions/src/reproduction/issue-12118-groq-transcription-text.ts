import { groq } from '../../../../packages/groq/src';
import { experimental_transcribe as transcribe } from '../../../../packages/ai/src';
import { readFile } from 'node:fs/promises';

const modelId = 'whisper-large-v3';

async function main() {
  const audio = await readFile('../ai-core/data/galileo.mp3');

  const formData = new FormData();
  formData.append('model', modelId);
  formData.append('response_format', 'text');
  formData.append(
    'file',
    new File([audio], 'galileo.mp3', { type: 'audio/mpeg' }),
  );

  const directResponse = await fetch(
    'https://api.groq.com/openai/v1/audio/transcriptions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: formData,
    },
  );
  const directBody = await directResponse.text();
  const directContentType = directResponse.headers.get('content-type');

  if (!directResponse.ok) {
    throw new Error(
      `DIRECT_PROVIDER_BLOCKED: HTTP ${directResponse.status}: ${directBody}`,
    );
  }

  if (
    directBody.trim().length === 0 ||
    !directContentType?.startsWith('text/plain')
  ) {
    throw new Error(
      `DIRECT_PROVIDER_UNEXPECTED: content-type=${directContentType} bodyLength=${directBody.length}`,
    );
  }

  console.log(
    `DIRECT_PROVIDER_OK: status=${directResponse.status} content-type=${directContentType} bodyLength=${directBody.length}`,
  );
  console.log(
    `DIRECT_PROVIDER_FIXTURE: ${JSON.stringify({
      status: directResponse.status,
      contentType: directContentType,
      body: directBody,
    })}`,
  );

  await transcribe({
    model: groq.transcription(modelId),
    audio,
    maxRetries: 0,
    providerOptions: {
      groq: {
        responseFormat: 'text',
      },
    },
  });
}

main().catch(error => {
  if (
    error instanceof Error &&
    error.message.includes('Invalid JSON response')
  ) {
    console.error(
      'ISSUE_12118_REPRODUCED: AI SDK rejected Groq responseFormat=text with Invalid JSON response',
    );
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
