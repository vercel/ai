import { AISDKError, InvalidResponseDataError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { DefaultGeneratedAudioFile } from './generated-audio-file';

describe('DefaultGeneratedAudioFile', () => {
  it('derives the format from the media type subtype', () => {
    const file = new DefaultGeneratedAudioFile({
      data: 'AQID',
      mediaType: 'audio/wav',
    });

    expect(file.format).toBe('wav');
  });

  it('keeps the format as mp3 for audio/mpeg', () => {
    const file = new DefaultGeneratedAudioFile({
      data: 'AQID',
      mediaType: 'audio/mpeg',
    });

    expect(file.format).toBe('mp3');
  });

  it('defaults the format to mp3 when the media type has no subtype', () => {
    const file = new DefaultGeneratedAudioFile({
      data: 'AQID',
      mediaType: 'audio',
    });

    expect(file.format).toBe('mp3');
  });

  it('throws an InvalidResponseDataError when the format cannot be determined', () => {
    expect(
      () =>
        new DefaultGeneratedAudioFile({
          data: 'AQID',
          mediaType: 'audio/',
        }),
    ).toThrow(InvalidResponseDataError);
  });

  it('throws an AISDKError (not a plain Error) carrying the offending media type', () => {
    const createWithInvalidMediaType = () =>
      new DefaultGeneratedAudioFile({ data: 'AQID', mediaType: 'audio/' });

    let error: unknown;
    try {
      createWithInvalidMediaType();
    } catch (e) {
      error = e;
    }

    expect(AISDKError.isInstance(error)).toBe(true);
    expect(InvalidResponseDataError.isInstance(error)).toBe(true);
    expect((error as InvalidResponseDataError).data).toBe('audio/');
  });
});
