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

// Base64 ID3v2 header starts with "SUQz" (ID3)
const isBase64ID3v2 = (base64Data: string): boolean => {
  return base64Data.startsWith('SUQz');
};

// Convert base64 to bytes for ID3 processing
const base64ToBytes = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

// Strip ID3 tags from data if present
function stripID3TagsIfPresent(
  data: Uint8Array | string
): Uint8Array | string {
  // Handle binary data
  if (typeof data !== 'string' && data.length > 10) {
    // Check for ID3v2 header in binary data
    if (data[0] === 0x49 && data[1] === 0x44 && data[2] === 0x33) {
      return stripID3(data);
    }
  } 
  
  // Handle base64 encoded data
  else if (typeof data === 'string' && isBase64ID3v2(data)) {
    try {
      const bytes = base64ToBytes(data);
      const strippedBytes = stripID3(bytes);
      
      // Convert back to base64
      const binaryString = String.fromCharCode(...strippedBytes);
      return btoa(binaryString);
    } catch (e) {
      // If base64 conversion fails, return original data
      return data;
    }
  }

  // Return original data if no ID3 tags or processing failed
  return data;
}

export function detectMimeType({
  data,
  signatures,
}: {
  data: Uint8Array | string;
  signatures: typeof audioMimeTypeSignatures | typeof imageMimeTypeSignatures;
}): (typeof signatures)[number]['mimeType'] | undefined {
  const processedData = stripID3TagsIfPresent(data);

  for (const signature of signatures) {
    if (
      typeof processedData === 'string'
        ? processedData.startsWith(signature.base64Prefix)
        : processedData.length >= signature.bytesPrefix.length &&
          signature.bytesPrefix.every((byte, index) => processedData[index] === byte)
    ) {
      return signature.mimeType;
    }
  }

  return undefined;
}
