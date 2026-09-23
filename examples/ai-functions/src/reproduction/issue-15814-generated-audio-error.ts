import { AISDKError, InvalidResponseDataError } from 'ai';

async function main() {
  const generatedAudioFileModule =
    '../../../../packages/ai/src/generate-speech/generated-audio-file.ts';
  const { DefaultGeneratedAudioFile } = await import(generatedAudioFileModule);

  let thrown: unknown;

  try {
    new DefaultGeneratedAudioFile({
      data: new Uint8Array([1]),
      mediaType: 'audio/',
    });
  } catch (error) {
    thrown = error;
  }

  if (thrown === undefined) {
    throw new Error(
      'Expected an invalid audio media type to throw an AI SDK error.',
    );
  }

  if (!AISDKError.isInstance(thrown)) {
    console.error(
      'ISSUE_15814_REPRODUCED: malformed audio media type threw Error instead of AISDKError',
    );
    throw new Error('Expected the thrown error to be an AISDKError.');
  }

  if (!InvalidResponseDataError.isInstance(thrown)) {
    throw new Error(
      'Expected the thrown error to be an InvalidResponseDataError.',
    );
  }
}

main();
