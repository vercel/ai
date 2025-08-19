import { describe, it, expect } from 'vitest';
import { mediaTypeToExtension } from './media-type-to-extension';

describe('mediaTypeToExtension()', () => {
  it('should map audio media types to their correct extensions', () => {
    expect(mediaTypeToExtension('audio/mpeg')).toBe('mp3');
    expect(mediaTypeToExtension('audio/mp3')).toBe('mp3');
    expect(mediaTypeToExtension('audio/wav')).toBe('wav');
    expect(mediaTypeToExtension('audio/x-wav')).toBe('wav');
    expect(mediaTypeToExtension('audio/webm')).toBe('webm');
    expect(mediaTypeToExtension('audio/ogg')).toBe('ogg');
    expect(mediaTypeToExtension('audio/opus')).toBe('ogg');
    expect(mediaTypeToExtension('audio/mp4')).toBe('m4a');
    expect(mediaTypeToExtension('audio/x-m4a')).toBe('m4a');
    expect(mediaTypeToExtension('audio/flac')).toBe('flac');
    expect(mediaTypeToExtension('audio/aac')).toBe('aac');
  });
});
