import { AISDKError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { InvalidArgumentError } from '../error/invalid-argument-error';
import { DefaultGeneratedAudioFile } from './generated-audio-file';

describe('DefaultGeneratedAudioFile', () => {
  it('should throw a guardable InvalidArgumentError when the audio format cannot be determined', () => {
    let error: unknown;

    try {
      new DefaultGeneratedAudioFile({
        data: new Uint8Array([1, 2, 3]),
        mediaType: 'audio/',
      });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(AISDKError.isInstance(error)).toBe(true);
    expect(InvalidArgumentError.isInstance(error)).toBe(true);
    expect(error).toMatchObject({
      name: 'AI_InvalidArgumentError',
      message:
        'Invalid argument for parameter mediaType: Audio format must be provided or determinable from media type',
      parameter: 'mediaType',
      value: 'audio/',
    });
  });
});
