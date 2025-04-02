import { describe, it, expect } from 'vitest';
import { detectAudioMimeType } from './detect-audio-mime-type';

describe('detectAudioMimeType', () => {
  describe('MP3', () => {
    it('should detect MP3 from bytes', () => {
      const mp3Bytes = new Uint8Array([0xff, 0xfb]);
      expect(detectAudioMimeType(mp3Bytes)).toBe('audio/mpeg');
    });

    it('should detect MP3 from base64', () => {
      const mp3Base64 = 'SUQzBA'; // Base64 string starting with MP3 signature
      expect(detectAudioMimeType(mp3Base64)).toBe('audio/mpeg');
    });
  });

  describe('WAV', () => {
    it('should detect WAV from bytes', () => {
      const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      expect(detectAudioMimeType(wavBytes)).toBe('audio/wav');
    });

    it('should detect WAV from base64', () => {
      const wavBase64 = 'UklGR'; // Base64 string starting with WAV signature
      expect(detectAudioMimeType(wavBase64)).toBe('audio/wav');
    });
  });

  describe('OGG', () => {
    it('should detect OGG from bytes', () => {
      const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
      expect(detectAudioMimeType(oggBytes)).toBe('audio/ogg');
    });

    it('should detect OGG from base64', () => {
      const oggBase64 = 'T2dnUw'; // Base64 string starting with OGG signature
      expect(detectAudioMimeType(oggBase64)).toBe('audio/ogg');
    });
  });

  describe('FLAC', () => {
    it('should detect FLAC from bytes', () => {
      const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
      expect(detectAudioMimeType(flacBytes)).toBe('audio/flac');
    });

    it('should detect FLAC from base64', () => {
      const flacBase64 = 'ZkxhQw'; // Base64 string starting with FLAC signature
      expect(detectAudioMimeType(flacBase64)).toBe('audio/flac');
    });
  });

  describe('AAC', () => {
    it('should detect AAC from bytes', () => {
      const aacBytes = new Uint8Array([0x40, 0x15, 0x00, 0x00]);
      expect(detectAudioMimeType(aacBytes)).toBe('audio/aac');
    });

    it('should detect AAC from base64', () => {
      const aacBase64 = 'AAC'; // Base64 string starting with AAC signature
      expect(detectAudioMimeType(aacBase64)).toBe('audio/aac');
    });
  });

  describe('MP4', () => {
    it('should detect MP4 from bytes', () => {
      const mp4Bytes = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
      expect(detectAudioMimeType(mp4Bytes)).toBe('audio/mp4');
    });

    it('should detect MP4 from base64', () => {
      const mp4Base64 = 'AAAA'; // Base64 string starting with MP4 signature
      expect(detectAudioMimeType(mp4Base64)).toBe('audio/mp4');
    });
  });

  describe('error cases', () => {
    it('should return undefined for unknown audio formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(detectAudioMimeType(unknownBytes)).toBeUndefined();
    });

    it('should return undefined for empty arrays', () => {
      const emptyBytes = new Uint8Array([]);
      expect(detectAudioMimeType(emptyBytes)).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length', () => {
      const shortBytes = new Uint8Array([0x4f, 0x67]); // Incomplete OGG signature
      expect(detectAudioMimeType(shortBytes)).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings', () => {
      const invalidBase64 = 'invalid123';
      expect(detectAudioMimeType(invalidBase64)).toBeUndefined();
    });
  });
});
