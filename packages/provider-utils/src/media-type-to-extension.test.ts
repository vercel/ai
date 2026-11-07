import { describe, it, expect } from 'vitest';
import { mediaTypeToExtension } from './media-type-to-extension';

describe('mediaTypeToExtension()', () => {
  it.each([
    // most common
    ['audio/mpeg', 'mp3'],
    ['audio/mp3', 'mp3'],
    ['audio/wav', 'wav'],
    ['audio/x-wav', 'wav'],
    ['audio/webm', 'webm'],
    ['audio/ogg', 'ogg'],
    ['audio/opus', 'ogg'],
    ['audio/mp4', 'm4a'],
    ['audio/x-m4a', 'm4a'],
    ['audio/flac', 'flac'],
    ['audio/aac', 'aac'],
    // upper case
    ['AUDIO/MPEG', 'mp3'],
    ['AUDIO/MP3', 'mp3'],
    // with parameters / codecs
    ['audio/mp4; codecs=opus', 'm4a'],
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/ogg; codecs=opus', 'ogg'],
    ['audio/wav; rate=16000', 'wav'],
    ['audio/mpeg; charset=utf-8', 'mp3'],
    // invalid
    ['nope', ''],
  ])('should map %s to %s', (mediaType, expectedExtension) => {
    expect(mediaTypeToExtension(mediaType)).toBe(expectedExtension);
  });
});
