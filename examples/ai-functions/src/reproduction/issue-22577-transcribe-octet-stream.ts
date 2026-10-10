import { transcribe } from 'ai';
import { MockTranscriptionModelV4 } from 'ai/test';

const expectedMediaType = 'audio/aac';
const reportedMediaType = 'application/octet-stream';

class ReproducedBugError extends Error {}

async function main() {
  let receivedMediaType: string | undefined;

  await transcribe({
    model: new MockTranscriptionModelV4({
      doGenerate: async args => {
        receivedMediaType = args.mediaType;
        return {
          text: '',
          segments: [],
          language: undefined,
          durationInSeconds: undefined,
          warnings: [],
          response: {
            timestamp: new Date(0),
            modelId: 'mock-model',
            headers: {},
          },
          providerMetadata: {},
        };
      },
    }),
    audio: new URL('https://example.com/audio'),
    download: async () => ({
      data: new Uint8Array([0xff, 0xf1, 0x50, 0x40]),
      mediaType: reportedMediaType,
    }),
  });

  if (receivedMediaType === reportedMediaType) {
    throw new ReproducedBugError(
      'ISSUE_22577: transcribe forwarded generic application/octet-stream instead of detected audio/aac',
    );
  }

  if (receivedMediaType !== expectedMediaType) {
    throw new Error(
      `Expected ${expectedMediaType}, but provider received ${String(receivedMediaType)}`,
    );
  }

  console.log('Issue #22577 did not reproduce.');
}

main().catch(error => {
  if (error instanceof ReproducedBugError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
