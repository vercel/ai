// atob needs to be invoked as a function call, not as a method call.
// Otherwise Cloudflare will throw a
// "TypeError: Illegal invocation: function called with incorrect this reference"
const { atob } = globalThis;

/**
 * Converts a data URL of type text/* to a text string.
 */
export function getTextFromDataUrl(dataUrl: string): string {
  const [header, base64Content] = dataUrl.split(',');
  const mediaType = header.split(';')[0].split(':')[1];
  const charsetMatch = /(?:^|;)\s*charset\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(
    header,
  );
  const charset = charsetMatch?.[1] ?? charsetMatch?.[2];

  if (mediaType == null || base64Content == null) {
    throw new Error('Invalid data URL format');
  }

  try {
<<<<<<< HEAD
    return atob(base64Content);
  } catch (error) {
    throw new Error(`Error decoding data URL`);
=======
    const byteString = atob(base64Content);

    if (charset == null) {
      return byteString;
    }

    return new TextDecoder(charset).decode(
      Uint8Array.from(byteString, byte => byte.codePointAt(0)!),
    );
  } catch {
    throw new InvalidArgumentError({
      parameter: 'dataUrl',
      value: dataUrl,
      message: 'Error decoding data URL',
    });
>>>>>>> c415657d17 (fix: preserve Unicode text when decoding base64 data URLs with a declared charset (#21115))
  }
}
