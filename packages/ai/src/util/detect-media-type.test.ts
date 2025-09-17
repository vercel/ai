import { describe, expect, it } from 'vitest';
import {
  audioMediaTypeSignatures,
  detectMediaType,
  imageMediaTypeSignatures,
} from './detect-media-type';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';

describe('detectMediaType', () => {
  describe('GIF', () => {
    it('should detect GIF from bytes', () => {
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0xff, 0xff]);
      expect(
        detectMediaType({
          data: gifBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/gif');
    });

    it('should detect GIF from base64', () => {
      const gifBase64 = 'R0lGabc123'; // Base64 string starting with GIF signature
      expect(
        detectMediaType({
          data: gifBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/gif');
    });
  });

  describe('PNG', () => {
    it('should detect PNG from bytes', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
      expect(
        detectMediaType({
          data: pngBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/png');
    });

    it('should detect PNG from base64', () => {
      const pngBase64 = 'iVBORwabc123'; // Base64 string starting with PNG signature
      expect(
        detectMediaType({
          data: pngBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/png');
    });
  });

  describe('JPEG', () => {
    it('should detect JPEG from bytes', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xff]);
      expect(
        detectMediaType({
          data: jpegBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/jpeg');
    });

    it('should detect JPEG from base64', () => {
      const jpegBase64 = '/9j/abc123'; // Base64 string starting with JPEG signature
      expect(
        detectMediaType({
          data: jpegBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/jpeg');
    });
  });

  describe('WebP', () => {
    it('should detect WebP from bytes', () => {
      const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xff, 0xff]);
      expect(
        detectMediaType({
          data: webpBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/webp');
    });

    it('should detect WebP from base64', () => {
      const webpBase64 = 'UklGRgabc123'; // Base64 string starting with WebP signature
      expect(
        detectMediaType({
          data: webpBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/webp');
    });
  });

  describe('BMP', () => {
    it('should detect BMP from bytes', () => {
      const bmpBytes = new Uint8Array([0x42, 0x4d, 0xff, 0xff]);
      expect(
        detectMediaType({
          data: bmpBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/bmp');
    });

    it('should detect BMP from base64', () => {
      const bmpBase64 = 'Qkabc123'; // Base64 string starting with BMP signature
      expect(
        detectMediaType({
          data: bmpBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/bmp');
    });
  });

  describe('TIFF', () => {
    it('should detect TIFF (little endian) from bytes', () => {
      const tiffLEBytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff]);
      expect(
        detectMediaType({
          data: tiffLEBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (little endian) from base64', () => {
      const tiffLEBase64 = 'SUkqAAabc123'; // Base64 string starting with TIFF LE signature
      expect(
        detectMediaType({
          data: tiffLEBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from bytes', () => {
      const tiffBEBytes = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0xff]);
      expect(
        detectMediaType({
          data: tiffBEBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from base64', () => {
      const tiffBEBase64 = 'TU0AKgabc123'; // Base64 string starting with TIFF BE signature
      expect(
        detectMediaType({
          data: tiffBEBase64,
          signatures: imageMediaTypeSignatures,
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
        detectMediaType({
          data: avifBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/avif');
    });

    it('should detect AVIF from base64', () => {
      const avifBase64 = 'AAAAIGZ0eXBhdmlmabc123'; // Base64 string starting with AVIF signature
      expect(
        detectMediaType({
          data: avifBase64,
          signatures: imageMediaTypeSignatures,
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
        detectMediaType({
          data: heicBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/heic');
    });

    it('should detect HEIC from base64', () => {
      const heicBase64 = 'AAAAIGZ0eXBoZWljabc123'; // Base64 string starting with HEIC signature
      expect(
        detectMediaType({
          data: heicBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBe('image/heic');
    });
  });

  describe('MP3', () => {
    it('should detect MP3 from bytes', () => {
      const mp3Bytes = new Uint8Array([0xff, 0xfb]);
      expect(
        detectMediaType({
          data: mp3Bytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mpeg');
    });

    it('should detect MP3 from base64', () => {
      const mp3Base64 = '//s='; // Base64 string starting with MP3 signature
      expect(
        detectMediaType({
          data: mp3Base64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mpeg');
    });

    it('should detect MP3 with ID3v2 tags from bytes', () => {
      const mp3WithID3Bytes = new Uint8Array([
        0x49,
        0x44,
        0x33, // 'ID3'
        0x03,
        0x00, // version
        0x00, // flags
        0x00,
        0x00,
        0x00,
        0x0a, // size (10 bytes)
        // 10 bytes of ID3 data
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        // MP3 frame header
        0xff,
        0xfb,
        0x00,
        0x00,
      ]);
      expect(
        detectMediaType({
          data: mp3WithID3Bytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mpeg');
    });
    it('should detect MP3 with ID3v2 tags from base64', () => {
      const mp3WithID3Bytes = new Uint8Array([
        0x49,
        0x44,
        0x33, // 'ID3'
        0x03,
        0x00, // version
        0x00, // flags
        0x00,
        0x00,
        0x00,
        0x0a, // size (10 bytes)
        // 10 bytes of ID3 data
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        // MP3 frame header
        0xff,
        0xfb,
        0x00,
        0x00,
      ]);
      const mp3WithID3Base64 = convertUint8ArrayToBase64(mp3WithID3Bytes);
      expect(
        detectMediaType({
          data: mp3WithID3Base64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mpeg');
    });
  });

  describe('WAV', () => {
    it('should detect WAV from bytes', () => {
      const wavBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
      expect(
        detectMediaType({
          data: wavBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/wav');
    });

    it('should detect WAV from base64', () => {
      const wavBase64 = 'UklGRiQ='; // Base64 string starting with WAV signature
      expect(
        detectMediaType({
          data: wavBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/wav');
    });
  });

  describe('OGG', () => {
    it('should detect OGG from bytes', () => {
      const oggBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53]);
      expect(
        detectMediaType({
          data: oggBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/ogg');
    });

    it('should detect OGG from base64', () => {
      const oggBase64 = 'T2dnUw'; // Base64 string starting with OGG signature
      expect(
        detectMediaType({
          data: oggBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/ogg');
    });
  });

  describe('FLAC', () => {
    it('should detect FLAC from bytes', () => {
      const flacBytes = new Uint8Array([0x66, 0x4c, 0x61, 0x43]);
      expect(
        detectMediaType({
          data: flacBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/flac');
    });

    it('should detect FLAC from base64', () => {
      const flacBase64 = 'ZkxhQw'; // Base64 string starting with FLAC signature
      expect(
        detectMediaType({
          data: flacBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/flac');
    });
  });

  describe('AAC', () => {
    it('should detect AAC from bytes', () => {
      const aacBytes = new Uint8Array([0x40, 0x15, 0x00, 0x00]);
      expect(
        detectMediaType({
          data: aacBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/aac');
    });

    it('should detect AAC from base64', () => {
      const aacBase64 = 'QBUA'; // Base64 string starting with AAC signature
      expect(
        detectMediaType({
          data: aacBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/aac');
    });
  });

  describe('MP4', () => {
    it('should detect MP4 from bytes', () => {
      const mp4Bytes = new Uint8Array([0x66, 0x74, 0x79, 0x70]);
      expect(
        detectMediaType({
          data: mp4Bytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mp4');
    });

    it('should detect MP4 from base64', () => {
      const mp4Base64 = 'ZnR5cA'; // Base64 string starting with MP4 signature
      expect(
        detectMediaType({
          data: mp4Base64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/mp4');
    });
  });

  describe('WEBM', () => {
    it('should detect WEBM from bytes', () => {
      const webmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
      expect(
        detectMediaType({
          data: webmBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/webm');
    });

    it('should detect WEBM from base64', () => {
      const webmBase64 = 'GkXfow=='; // Base64 string starting with WEBM signature
      expect(
        detectMediaType({
          data: webmBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBe('audio/webm');
    });
  });

  describe('error cases', () => {
    it('should return undefined for unknown image formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(
        detectMediaType({
          data: unknownBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for unknown audio formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(
        detectMediaType({
          data: unknownBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for empty arrays for image', () => {
      const emptyBytes = new Uint8Array([]);
      expect(
        detectMediaType({
          data: emptyBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for empty arrays for audio', () => {
      const emptyBytes = new Uint8Array([]);
      expect(
        detectMediaType({
          data: emptyBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length for image', () => {
      const shortBytes = new Uint8Array([0x89, 0x50]); // Incomplete PNG signature
      expect(
        detectMediaType({
          data: shortBytes,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length for audio', () => {
      const shortBytes = new Uint8Array([0x4f, 0x67]); // Incomplete OGG signature
      expect(
        detectMediaType({
          data: shortBytes,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings for image', () => {
      const invalidBase64 = 'invalid123';
      expect(
        detectMediaType({
          data: invalidBase64,
          signatures: imageMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings for audio', () => {
      const invalidBase64 = 'invalid123';
      expect(
        detectMediaType({
          data: invalidBase64,
          signatures: audioMediaTypeSignatures,
        }),
      ).toBeUndefined();
    });
  });
});
