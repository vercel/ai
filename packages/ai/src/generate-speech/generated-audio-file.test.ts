import { AISDKError, InvalidResponseDataError } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { DefaultGeneratedAudioFile } from './generated-audio-file';

describe('DefaultGeneratedAudioFile', () => {
  it('should throw an SDK error when the audio subtype is empty', () => {
    let thrownError: unknown;

    try {
      new DefaultGeneratedAudioFile({
        data: new Uint8Array([0]),
        mediaType: 'audio/',
      });
    } catch (error) {
      thrownError = error;
    }

    expect(AISDKError.isInstance(thrownError)).toBe(true);
    expect(InvalidResponseDataError.isInstance(thrownError)).toBe(true);
    expect(thrownError).toMatchObject({
      name: 'AI_InvalidResponseDataError',
      data: 'audio/',
      message: 'Could not determine audio format from media type: audio/',
    });
  });

  it.each([
    { mediaType: 'audio/mpeg', format: 'mp3' },
    { mediaType: 'audio/mp3', format: 'mp3' },
    { mediaType: 'audio/wav', format: 'wav' },
    { mediaType: 'audio/ogg', format: 'ogg' },
    { mediaType: '', format: 'mp3' },
    { mediaType: 'audio', format: 'mp3' },
    { mediaType: 'audio/mp3/extra', format: 'mp3' },
  ])('should derive $format from "$mediaType"', ({ mediaType, format }) => {
    const data = new Uint8Array([0]);
    const audio = new DefaultGeneratedAudioFile({ data, mediaType });

    expect(audio.format).toBe(format);
    expect(audio.mediaType).toBe(mediaType);
    expect(audio.uint8Array).toBe(data);
  });
});
