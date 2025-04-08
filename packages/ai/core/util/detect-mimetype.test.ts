import { describe, it, expect } from 'vitest';
import {
  detectMimeType,
  imageMimeTypeSignatures,
  audioMimeTypeSignatures,
} from './detect-mimetype';

describe('detectMimeType', () => {
  describe('GIF', () => {
    it('should detect GIF from bytes', () => {
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0xff, 0xff]);
      expect(
        detectMimeType({ data: gifBytes, signatures: imageMimeTypeSignatures }),
      ).toBe('image/gif');
    });

    it('should detect GIF from base64', () => {
      const gifBase64 = 'R0lGabc123'; // Base64 string starting with GIF signature
      expect(
        detectMimeType({
          data: gifBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/gif');
    });
  });

  describe('PNG', () => {
    it('should detect PNG from bytes', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
      expect(
        detectMimeType({ data: pngBytes, signatures: imageMimeTypeSignatures }),
      ).toBe('image/png');
    });

    it('should detect PNG from base64', () => {
      const pngBase64 = 'iVBORwabc123'; // Base64 string starting with PNG signature
      expect(
        detectMimeType({
          data: pngBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/png');
    });
  });

  describe('JPEG', () => {
    it('should detect JPEG from bytes', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xff]);
      expect(
        detectMimeType({
          data: jpegBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/jpeg');
    });

    it('should detect JPEG from base64', () => {
      const jpegBase64 = '/9j/abc123'; // Base64 string starting with JPEG signature
      expect(
        detectMimeType({
          data: jpegBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/jpeg');
    });
  });

  describe('WebP', () => {
    it('should detect WebP from bytes', () => {
      const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xff, 0xff]);
      expect(
        detectMimeType({
          data: webpBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/webp');
    });

    it('should detect WebP from base64', () => {
      const webpBase64 = 'UklGRgabc123'; // Base64 string starting with WebP signature
      expect(
        detectMimeType({
          data: webpBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/webp');
    });
  });

  describe('BMP', () => {
    it('should detect BMP from bytes', () => {
      const bmpBytes = new Uint8Array([0x42, 0x4d, 0xff, 0xff]);
      expect(
        detectMimeType({ data: bmpBytes, signatures: imageMimeTypeSignatures }),
      ).toBe('image/bmp');
    });

    it('should detect BMP from base64', () => {
      const bmpBase64 = 'Qkabc123'; // Base64 string starting with BMP signature
      expect(
        detectMimeType({
          data: bmpBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/bmp');
    });
  });

  describe('TIFF', () => {
    it('should detect TIFF (little endian) from bytes', () => {
      const tiffLEBytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff]);
      expect(
        detectMimeType({
          data: tiffLEBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (little endian) from base64', () => {
      const tiffLEBase64 = 'SUkqAAabc123'; // Base64 string starting with TIFF LE signature
      expect(
        detectMimeType({
          data: tiffLEBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from bytes', () => {
      const tiffBEBytes = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0xff]);
      expect(
        detectMimeType({
          data: tiffBEBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from base64', () => {
      const tiffBEBase64 = 'TU0AKgabc123'; // Base64 string starting with TIFF BE signature
      expect(
        detectMimeType({
          data: tiffBEBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/tiff');
    });
  });

  describe('AVIF', () => {
    it('should detect AVIF from bytes', () => {
      const avifBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
        0xff,
      ]);
      expect(
        detectMimeType({
          data: avifBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/avif');
    });

    it('should detect AVIF from base64', () => {
      const avifBase64 = 'AAAAIGZ0eXBhdmlmabc123'; // Base64 string starting with AVIF signature
      expect(
        detectMimeType({
          data: avifBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/avif');
    });
  });

  describe('HEIC', () => {
    it('should detect HEIC from bytes', () => {
      const heicBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
        0xff,
      ]);
      expect(
        detectMimeType({
          data: heicBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/heic');
    });

    it('should detect HEIC from base64', () => {
      const heicBase64 = 'AAAAIGZ0eXBoZWljabc123'; // Base64 string starting with HEIC signature
      expect(
        detectMimeType({
          data: heicBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBe('image/heic');
    });
  });

  describe('MP3', () => {
    it('should detect MP3 from bytes', () => {
      const mp3Bytes = new Uint8Array([0xff, 0xfb]);
      expect(
        detectMimeType({ data: mp3Bytes, signatures: audioMimeTypeSignatures }),
      ).toBe('audio/mpeg');
    });

    it('should detect MP3 from base64', () => {
      const mp3Base64 = '//s='; // Base64 string starting with MP3 signature
      expect(
        detectMimeType({
          data: mp3Base64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/mpeg');
    });
  });

  describe('WAV', () => {
    it('should detect WAV from bytes', () => {
      const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      expect(
        detectMimeType({ data: wavBytes, signatures: audioMimeTypeSignatures }),
      ).toBe('audio/wav');
    });

    it('should detect WAV from base64', () => {
      const wavBase64 = 'UklGRiQ='; // Base64 string starting with WAV signature
      expect(
        detectMimeType({
          data: wavBase64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/wav');
    });
  });

  describe('OGG', () => {
    it('should detect OGG from bytes', () => {
      const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
      expect(
        detectMimeType({ data: oggBytes, signatures: audioMimeTypeSignatures }),
      ).toBe('audio/ogg');
    });

    it('should detect OGG from base64', () => {
      const oggBase64 = 'T2dnUw'; // Base64 string starting with OGG signature
      expect(
        detectMimeType({
          data: oggBase64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/ogg');
    });
  });

  describe('FLAC', () => {
    it('should detect FLAC from bytes', () => {
      const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
      expect(
        detectMimeType({
          data: flacBytes,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/flac');
    });

    it('should detect FLAC from base64', () => {
      const flacBase64 = 'ZkxhQw'; // Base64 string starting with FLAC signature
      expect(
        detectMimeType({
          data: flacBase64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/flac');
    });
  });

  describe('AAC', () => {
    it('should detect AAC from bytes', () => {
      const aacBytes = new Uint8Array([0x40, 0x15, 0x00, 0x00]);
      expect(
        detectMimeType({ data: aacBytes, signatures: audioMimeTypeSignatures }),
      ).toBe('audio/aac');
    });

    it('should detect AAC from base64', () => {
      const aacBase64 = 'QBUA'; // Base64 string starting with AAC signature
      expect(
        detectMimeType({
          data: aacBase64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/aac');
    });
  });

  describe('MP4', () => {
    it('should detect MP4 from bytes', () => {
      const mp4Bytes = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
      expect(
        detectMimeType({ data: mp4Bytes, signatures: audioMimeTypeSignatures }),
      ).toBe('audio/mp4');
    });

    it('should detect MP4 from base64', () => {
      const mp4Base64 = 'ZnR5cA'; // Base64 string starting with MP4 signature
      expect(
        detectMimeType({
          data: mp4Base64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBe('audio/mp4');
    });
  });

  describe('error cases', () => {
    it('should return undefined for unknown image formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(
        detectMimeType({
          data: unknownBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for unknown audio formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(
        detectMimeType({
          data: unknownBytes,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for empty arrays for image', () => {
      const emptyBytes = new Uint8Array([]);
      expect(
        detectMimeType({
          data: emptyBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for empty arrays for audio', () => {
      const emptyBytes = new Uint8Array([]);
      expect(
        detectMimeType({
          data: emptyBytes,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length for image', () => {
      const shortBytes = new Uint8Array([0x89, 0x50]); // Incomplete PNG signature
      expect(
        detectMimeType({
          data: shortBytes,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length for audio', () => {
      const shortBytes = new Uint8Array([0x4f, 0x67]); // Incomplete OGG signature
      expect(
        detectMimeType({
          data: shortBytes,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings for image', () => {
      const invalidBase64 = 'invalid123';
      expect(
        detectMimeType({
          data: invalidBase64,
          signatures: imageMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings for audio', () => {
      const invalidBase64 = 'invalid123';
      expect(
        detectMimeType({
          data: invalidBase64,
          signatures: audioMimeTypeSignatures,
        }),
      ).toBeUndefined();
    });
  });
});
