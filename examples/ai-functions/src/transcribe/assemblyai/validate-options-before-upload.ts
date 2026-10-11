import { createAssemblyAI } from '@ai-sdk/assemblyai';
import { InvalidArgumentError, transcribe } from 'ai';

let requestCount = 0;

const assemblyai = createAssemblyAI({
  apiKey: 'not-used',
  fetch: async () => {
    requestCount++;
    throw new Error('Audio should not be uploaded when options are invalid.');
  },
});

try {
  await transcribe({
    model: assemblyai.transcription('universal-3-5-pro'),
    audio: new Uint8Array([1, 2, 3]),
    providerOptions: {
      assemblyai: {
        speakerLabels: 'invalid',
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
