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

export function detectMimeType({
  data,
  signatures,
}: {
  data: Uint8Array | string;
  signatures: typeof audioMimeTypeSignatures | typeof imageMimeTypeSignatures;
}): (typeof signatures)[number]['mimeType'] | undefined {
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
