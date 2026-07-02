import {
  AISDKError,
  InvalidResponseDataError,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { DefaultGeneratedAudioFile } from './generated-audio-file';

describe('DefaultGeneratedAudioFile', () => {
  it('throws an AI SDK error when the audio format cannot be determined', () => {
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
    expect(InvalidResponseDataError.isInstance(error)).toBe(true);
  });
});
