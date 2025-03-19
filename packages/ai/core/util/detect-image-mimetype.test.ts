import { describe, it, expect } from 'vitest';
import { detectImageMimeType } from './detect-image-mimetype';

describe('detectImageMimeType', () => {
  describe('GIF', () => {
    it('should detect GIF from bytes', () => {
      const gifBytes = new Uint8Array([0x47, 0x49, 0x46, 0xff, 0xff]);
      expect(detectImageMimeType(gifBytes)).toBe('image/gif');
    });

    it('should detect GIF from base64', () => {
      const gifBase64 = 'R0lGabc123'; // Base64 string starting with GIF signature
      expect(detectImageMimeType(gifBase64)).toBe('image/gif');
    });
  });

  describe('PNG', () => {
    it('should detect PNG from bytes', () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xff, 0xff]);
      expect(detectImageMimeType(pngBytes)).toBe('image/png');
    });

    it('should detect PNG from base64', () => {
      const pngBase64 = 'iVBORwabc123'; // Base64 string starting with PNG signature
      expect(detectImageMimeType(pngBase64)).toBe('image/png');
    });
  });

  describe('JPEG', () => {
    it('should detect JPEG from bytes', () => {
      const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xff]);
      expect(detectImageMimeType(jpegBytes)).toBe('image/jpeg');
    });

    it('should detect JPEG from base64', () => {
      const jpegBase64 = '/9j/abc123'; // Base64 string starting with JPEG signature
      expect(detectImageMimeType(jpegBase64)).toBe('image/jpeg');
    });
  });

  describe('WebP', () => {
    it('should detect WebP from bytes', () => {
      const webpBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0xff, 0xff]);
      expect(detectImageMimeType(webpBytes)).toBe('image/webp');
    });

    it('should detect WebP from base64', () => {
      const webpBase64 = 'UklGRgabc123'; // Base64 string starting with WebP signature
      expect(detectImageMimeType(webpBase64)).toBe('image/webp');
    });
  });

  describe('BMP', () => {
    it('should detect BMP from bytes', () => {
      const bmpBytes = new Uint8Array([0x42, 0x4d, 0xff, 0xff]);
      expect(detectImageMimeType(bmpBytes)).toBe('image/bmp');
    });

    it('should detect BMP from base64', () => {
      const bmpBase64 = 'Qkabc123'; // Base64 string starting with BMP signature
      expect(detectImageMimeType(bmpBase64)).toBe('image/bmp');
    });
  });

  describe('TIFF', () => {
    it('should detect TIFF (little endian) from bytes', () => {
      const tiffLEBytes = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0xff]);
      expect(detectImageMimeType(tiffLEBytes)).toBe('image/tiff');
    });

    it('should detect TIFF (little endian) from base64', () => {
      const tiffLEBase64 = 'SUkqAAabc123'; // Base64 string starting with TIFF LE signature
      expect(detectImageMimeType(tiffLEBase64)).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from bytes', () => {
      const tiffBEBytes = new Uint8Array([0x4d, 0x4d, 0x00, 0x2a, 0xff]);
      expect(detectImageMimeType(tiffBEBytes)).toBe('image/tiff');
    });

    it('should detect TIFF (big endian) from base64', () => {
      const tiffBEBase64 = 'TU0AKgabc123'; // Base64 string starting with TIFF BE signature
      expect(detectImageMimeType(tiffBEBase64)).toBe('image/tiff');
    });
  });

  describe('AVIF', () => {
    it('should detect AVIF from bytes', () => {
      const avifBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
        0xff,
      ]);
      expect(detectImageMimeType(avifBytes)).toBe('image/avif');
    });

    it('should detect AVIF from base64', () => {
      const avifBase64 = 'AAAAIGZ0eXBhdmlmabc123'; // Base64 string starting with AVIF signature
      expect(detectImageMimeType(avifBase64)).toBe('image/avif');
    });
  });

  describe('HEIC', () => {
    it('should detect HEIC from bytes', () => {
      const heicBytes = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
        0xff,
      ]);
      expect(detectImageMimeType(heicBytes)).toBe('image/heic');
    });

    it('should detect HEIC from base64', () => {
      const heicBase64 = 'AAAAIGZ0eXBoZWljabc123'; // Base64 string starting with HEIC signature
      expect(detectImageMimeType(heicBase64)).toBe('image/heic');
    });
  });

  describe('error cases', () => {
    it('should return undefined for unknown image formats', () => {
      const unknownBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
      expect(detectImageMimeType(unknownBytes)).toBeUndefined();
    });

    it('should return undefined for empty arrays', () => {
      const emptyBytes = new Uint8Array([]);
      expect(detectImageMimeType(emptyBytes)).toBeUndefined();
    });

    it('should return undefined for arrays shorter than signature length', () => {
      const shortBytes = new Uint8Array([0x89, 0x50]); // Incomplete PNG signature
      expect(detectImageMimeType(shortBytes)).toBeUndefined();
    });

    it('should return undefined for invalid base64 strings', () => {
      const invalidBase64 = 'invalid123';
      expect(detectImageMimeType(invalidBase64)).toBeUndefined();
    });
  });
});
