const mimeTypeSignatures = [
  { mimeType: 'image/gif' as const, bytes: [0x47, 0x49, 0x46] },
  { mimeType: 'image/png' as const, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: 'image/jpeg' as const, bytes: [0xff, 0xd8] },
  { mimeType: 'image/webp' as const, bytes: [0x52, 0x49, 0x46, 0x46] },
];

export function detectImageMimeType(
  image: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined {
  for (const { bytes, mimeType } of mimeTypeSignatures) {
    if (
      image.length >= bytes.length &&
      bytes.every((byte, index) => image[index] === byte)
    ) {
      return mimeType;
    }
  }

  return undefined;
}
