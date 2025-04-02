import { TypeValidationError } from '@ai-sdk/provider';

/**
 * Converts various audio input formats to a standardized interface
 * that provides methods to convert to different audio representations.
 *
 * @param audio - The audio input in various formats
 * @returns An object with methods to convert to different audio formats
 */
export function convertAudioInput(
  audio: Blob | File | Uint8Array | ArrayBuffer | Buffer | URL | string,
) {
  // Helper to infer MIME type from filename
  const inferMimeType = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'mp3':
        return 'audio/mpeg';
      case 'wav':
        return 'audio/wav';
      case 'ogg':
        return 'audio/ogg';
      case 'flac':
        return 'audio/flac';
      case 'm4a':
        return 'audio/mp4';
      default:
        return 'audio/wav'; // Default fallback
    }
  };

  // Helper to convert string to appropriate format
  const processStringInput = async (input: string) => {
    // Check if it's a URL
    if (input.startsWith('http://') || input.startsWith('https://')) {
      return await fetchFromUrl(new URL(input));
    }

    // Check if it's a base64 data URL
    if (input.startsWith('data:')) {
      const matches = input.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        throw new TypeValidationError({
          value: audio,
          cause: new Error('Invalid base64 data URL format'),
        });
      }

      const mimeType = matches[1];
      const base64Data = matches[2];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return {
        data: bytes.buffer,
        mimeType,
      };
    }

    // Assume it's a base64 string without data URL prefix
    try {
      const binaryString = atob(input);
      const bytes = new Uint8Array(binaryString.length);

      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      return {
        data: bytes.buffer,
        mimeType: 'audio/wav', // Default MIME type for raw base64
      };
    } catch (error) {
      throw new TypeValidationError({
        value: audio,
        cause: new Error(
          'Invalid audio string format. Expected URL or base64 encoded data',
        ),
      });
    }
  };

  // Helper to fetch from URL
  const fetchFromUrl = async (
    url: URL,
  ): Promise<{ data: ArrayBuffer; mimeType: string }> => {
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(
        `Failed to fetch audio from URL: ${response.status} ${response.statusText}`,
      );
    }

    const contentType =
      response.headers.get('content-type') || inferMimeType(url.pathname);
    const arrayBuffer = await response.arrayBuffer();

    return {
      data: arrayBuffer,
      mimeType: contentType,
    };
  };

  // Main conversion logic
  const convert = async (): Promise<{
    data: ArrayBuffer;
    mimeType: string;
  }> => {
    if (audio instanceof Blob) {
      return {
        data: await audio.arrayBuffer(),
        mimeType: audio.type || 'audio/wav',
      };
    }

    if (audio instanceof File) {
      return {
        data: await audio.arrayBuffer(),
        mimeType: audio.type || inferMimeType(audio.name),
      };
    }

    if (audio instanceof Uint8Array) {
      return {
        data: audio.buffer,
        mimeType: 'audio/wav',
      };
    }

    if (audio instanceof ArrayBuffer) {
      return {
        data: audio,
        mimeType: 'audio/wav',
      };
    }

    // Handle Buffer (Node.js)
    if (typeof Buffer !== 'undefined' && audio instanceof Buffer) {
      return {
        data: audio.buffer.slice(
          audio.byteOffset,
          audio.byteOffset + audio.byteLength,
        ),
        mimeType: 'audio/wav',
      };
    }

    if (audio instanceof URL) {
      return await fetchFromUrl(audio);
    }

    if (typeof audio === 'string') {
      return await processStringInput(audio);
    }

    throw new TypeValidationError({
      value: audio,
      cause: new Error('Unsupported audio input format'),
    });
  };

  return {
    /**
     * Converts the audio input to a Blob
     * @param mimeType - Optional MIME type to override the inferred type
     * @returns A Promise resolving to a Blob
     */
    toBlob: async (mimeType?: string): Promise<Blob> => {
      const { data, mimeType: inferredType } = await convert();
      return new Blob([data], { type: mimeType || inferredType });
    },

    /**
     * Converts the audio input to a File
     * @param filename - Optional filename (defaults to 'audio.wav')
     * @param mimeType - Optional MIME type to override the inferred type
     * @returns A Promise resolving to a File
     */
    toFile: async (
      filename = 'audio.wav',
      mimeType?: string,
    ): Promise<File> => {
      const { data, mimeType: inferredType } = await convert();
      return new File([data], filename, { type: mimeType || inferredType });
    },

    /**
     * Converts the audio input to an ArrayBuffer
     * @returns A Promise resolving to an ArrayBuffer
     */
    toArrayBuffer: async (): Promise<ArrayBuffer> => {
      const { data } = await convert();
      return data;
    },

    /**
     * Converts the audio input to a Uint8Array
     * @returns A Promise resolving to a Uint8Array
     */
    toUint8Array: async (): Promise<Uint8Array> => {
      const { data } = await convert();
      return new Uint8Array(data);
    },

    /**
     * Gets the MIME type of the audio
     * @returns A Promise resolving to the MIME type string
     */
    getMimeType: async (): Promise<string> => {
      const { mimeType } = await convert();
      return mimeType;
    },
  };
}
