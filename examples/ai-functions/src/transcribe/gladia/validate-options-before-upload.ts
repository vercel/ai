import { createGladia } from '@ai-sdk/gladia';
import { InvalidArgumentError, transcribe } from 'ai';

let requestCount = 0;

const gladia = createGladia({
  apiKey: 'not-used',
  fetch: async () => {
    requestCount++;
    throw new Error('Audio should not be uploaded when options are invalid.');
  },
});

try {
  await transcribe({
    model: gladia.transcription(),
    audio: new Uint8Array([1, 2, 3]),
    providerOptions: {
      gladia: {
        diarization: 'invalid',
      },
    },
  });
} catch (error) {
  if (!InvalidArgumentError.isInstance(error)) {
    throw error;
  }

  console.log(error.name);
  console.log('Provider requests:', requestCount);
}
