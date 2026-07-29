import { createGroq } from '@ai-sdk/groq';
import { transcribe } from 'ai';

const audioUrl =
  'https://upload.wikimedia.org/wikipedia/commons/0/07/Taro_Yamamoto_-_speech_in_shimbashi_-_2018_4_26.webm';

async function main() {
  const audioResponse = await fetch(audioUrl);
  if (!audioResponse.ok) {
    throw new Error(`Failed to download WebM: ${audioResponse.status}`);
  }

  const audio = await audioResponse.arrayBuffer();

  const formData = new FormData();
  formData.append(
    'file',
    new File([audio], 'audio.webm', { type: 'audio/webm' }),
  );
  formData.append('model', 'whisper-large-v3');

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

  if (!directResponse.ok) {
    const directBody = await directResponse.text();
    throw new Error(
      `Direct Groq transcription failed (${directResponse.status}): ${directBody}`,
    );
  }

  const directResult: unknown = await directResponse.json();
  if (
    directResult == null ||
    typeof directResult !== 'object' ||
    !('text' in directResult) ||
    typeof directResult.text !== 'string' ||
    directResult.text.length === 0
  ) {
    throw new Error('Direct Groq API returned an empty transcription');
  }

  let uploadedFilename: string | undefined;
  const provider = createGroq({
    fetch: async (input, init) => {
      if (init?.body instanceof FormData) {
        const file = init.body.get('file');
        uploadedFilename = file instanceof File ? file.name : undefined;
      }
      return fetch(input, init);
    },
  });

  const result = await transcribe({
    model: provider.transcription('whisper-large-v3'),
    audio,
    maxRetries: 0,
  });

  if (uploadedFilename !== 'audio.webm') {
    throw new Error(
      `AI SDK uploaded the WebM with filename "${uploadedFilename}" instead of "audio.webm"`,
    );
  }

  if (result.text.length === 0) {
    throw new Error('AI SDK returned an empty transcription');
  }

  console.log(
    'Issue #8846 could not be reproduced: direct Groq and AI SDK both transcribed the valid WebM file.',
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
