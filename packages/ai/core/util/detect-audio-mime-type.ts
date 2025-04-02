const mimeTypeSignatures = [
  {
    mimeType: 'audio/mpeg' as const,
    bytesPrefix: [0xff, 0xfb],
    base64Prefix: 'SUQzBA',
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
    base64Prefix: 'AAC',
  },
  {
    mimeType: 'audio/mp4' as const,
    bytesPrefix: [0x66, 0x74, 0x79, 0x70],
    base64Prefix: 'AAAA',
  },
] as const;

export function detectAudioMimeType(
  audio: Uint8Array | string,
): (typeof mimeTypeSignatures)[number]['mimeType'] | undefined {
  for (const signature of mimeTypeSignatures) {
    if (
      typeof audio === 'string'
        ? audio.startsWith(signature.base64Prefix)
        : audio.length >= signature.bytesPrefix.length &&
          signature.bytesPrefix.every((byte, index) => audio[index] === byte)
    ) {
      return signature.mimeType;
    }
  }

  return undefined;
}
