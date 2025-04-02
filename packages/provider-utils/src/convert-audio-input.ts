import { TypeValidationError } from '@ai-sdk/provider';

/**
 * Converts various audio input formats to a standardized interface
 * that provides methods to convert to different audio representations.
 *
 * @param audio - The audio input in various formats
 * @returns An object with methods to convert to different audio formats
 */
export function convertAudioInput(
  audio: Uint8Array | string,
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
      throw new TypeValidationError({
        value: audio,
        cause: new Error('URL input is not supported'),
      });
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
          'Invalid audio string format. Expected base64 encoded data',
        ),
      });
    }
  };

  // Main conversion logic
  const convert = async (): Promise<{
    data: ArrayBuffer;
    mimeType: string;
  }> => {
    if (audio instanceof Uint8Array) {
      return {
        data: audio.buffer,
        mimeType: 'audio/wav',
      };
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
