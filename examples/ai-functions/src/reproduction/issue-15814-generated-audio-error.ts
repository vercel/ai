import { AISDKError } from '@ai-sdk/provider';
import { DefaultGeneratedAudioFile } from '../../../../packages/ai/src/generate-speech/generated-audio-file';

async function main() {
  let thrownError: unknown;

  try {
    new DefaultGeneratedAudioFile({
      data: new Uint8Array([0]),
      mediaType: 'audio/',
    });
  } catch (error) {
    thrownError = error;
  }

  if (!AISDKError.isInstance(thrownError)) {
    const received =
      thrownError instanceof Error
        ? `${thrownError.constructor.name}: ${thrownError.message}`
        : String(thrownError);

    throw new Error(
      `ISSUE #15814: expected malformed audio media type to throw an AISDKError; received ${received}`,
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
