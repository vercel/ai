import { convertBase64ToUint8Array } from '@ai-sdk/provider-utils';

export const imageMimeTypeSignatures = [
  {
    mimeType: 'image/gif' as const,
    bytesPrefix: [0x47, 0x49, 0x46],
    base64Prefix: 'R0lG',
  },
  {
    mimeType: 'image/png' as const,
    bytesPrefix: [0x89, 0x50, 0x4e, 0x47],
    base64Prefix: 'iVBORw',
  },
  {
    mimeType: 'image/jpeg' as const,
    bytesPrefix: [0xff, 0xd8],
    base64Prefix: '/9j/',
  },
  {
    mimeType: 'image/webp' as const,
    bytesPrefix: [0x52, 0x49, 0x46, 0x46],
    base64Prefix: 'UklGRg',
  },
  {
    mimeType: 'image/bmp' as const,
    bytesPrefix: [0x42, 0x4d],
    base64Prefix: 'Qk',
  },
  {
    mimeType: 'image/tiff' as const,
    bytesPrefix: [0x49, 0x49, 0x2a, 0x00],
    base64Prefix: 'SUkqAA',
  },
  {
    mimeType: 'image/tiff' as const,
    bytesPrefix: [0x4d, 0x4d, 0x00, 0x2a],
    base64Prefix: 'TU0AKg',
  },
  {
    mimeType: 'image/avif' as const,
    bytesPrefix: [
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66,
    ],
    base64Prefix: 'AAAAIGZ0eXBhdmlm',
  },
  {
    mimeType: 'image/heic' as const,
    bytesPrefix: [
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63,
    ],
    base64Prefix: 'AAAAIGZ0eXBoZWlj',
  },
] as const;

export const audioMimeTypeSignatures = [
  {
    mimeType: 'audio/mpeg' as const,
    bytesPrefix: [0xff, 0xfb],
    base64Prefix: '//s=',
  },
  {
    mimeType: 'audio/wav' as const,
    bytesPrefix: [0x52, 0x49, 0x46, 0x46],
    base64Prefix: 'UklGR',
  },
  {
    mimeType: 'audio/ogg' as const,
    bytesPrefix: [0x4f, 0x67, 0x67, 0x53],
    base64Prefix: 'T2dnUw',
  },
  {
    mimeType: 'audio/flac' as const,
    bytesPrefix: [0x66, 0x4c, 0x61, 0x43],
    base64Prefix: 'ZkxhQw',
  },
  {
    mimeType: 'audio/aac' as const,
    bytesPrefix: [0x40, 0x15, 0x00, 0x00],
    base64Prefix: 'QBUA',
  },
  {
    mimeType: 'audio/mp4' as const,
    bytesPrefix: [0x66, 0x74, 0x79, 0x70],
    base64Prefix: 'ZnR5cA',
  },
] as const;

const getID3v2TagSize = (header: Uint8Array) => {
  const size =
    ((header[6] & 0x7f) << 21) |
    ((header[7] & 0x7f) << 14) |
    ((header[8] & 0x7f) << 7) |
    (header[9] & 0x7f);

  return size + 10; // add header size
};

const stripID3 = (arrayBuffer: Uint8Array) => {
  const bytes = new Uint8Array(arrayBuffer);

  if (
    bytes[0] === 0x49 && // 'I'
    bytes[1] === 0x44 && // 'D'
    bytes[2] === 0x33 // '3'
  ) {
    const id3Size = getID3v2TagSize(bytes);
    return bytes.slice(id3Size); // The raw MP3 starts here
  }

  return bytes; // No ID3 tag, return as-is
};

export function detectMimeType({
  data,
  signatures,
}: {
  data: Uint8Array | string;
  signatures: typeof audioMimeTypeSignatures | typeof imageMimeTypeSignatures;
}): (typeof signatures)[number]['mimeType'] | undefined {
  // Handle MP3 files with ID3 tags
  if (typeof data !== 'string' && data.length > 10) {
    // Check for ID3v2 header
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
      const strippedData = stripID3(data);

      for (const signature of signatures) {
        if (
          strippedData.length >= signature.bytesPrefix.length &&
          signature.bytesPrefix.every(
            (byte, index) => strippedData[index] === byte,
          )
        ) {
          return signature.mimeType;
        }
      }
    }
  }

  // Regular signature check
  for (const signature of signatures) {
    if (
      typeof data === 'string'
        ? data.startsWith(signature.base64Prefix)
        : data.length >= signature.bytesPrefix.length &&
          signature.bytesPrefix.every((byte, index) => data[index] === byte)
    ) {
      return signature.mimeType;
    }
  }

  return undefined;
}
