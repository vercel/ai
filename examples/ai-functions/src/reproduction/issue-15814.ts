import { strict as assert } from 'node:assert';
import { AISDKError } from '../../../../packages/provider/src/errors/ai-sdk-error';
import { InvalidResponseDataError } from '../../../../packages/provider/src/errors/invalid-response-data-error';
import { DefaultGeneratedAudioFile } from '../../../../packages/ai/src/generate-speech/generated-audio-file';

async function main() {
  let thrown: unknown;

  try {
    new DefaultGeneratedAudioFile({
      data: new Uint8Array(),
      mediaType: 'audio/',
    });
  } catch (error) {
    thrown = error;
  }

  assert.notEqual(
    thrown,
    undefined,
    'Malformed provider audio media type should be rejected',
  );

  assert.ok(
    AISDKError.isInstance(thrown),
    'ISSUE_15814: malformed audio media type threw a plain Error instead of an AISDKError',
  );
  assert.ok(
    InvalidResponseDataError.isInstance(thrown),
    'Malformed provider audio media type should throw InvalidResponseDataError',
  );
  assert.equal(thrown.name, 'AI_InvalidResponseDataError');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
