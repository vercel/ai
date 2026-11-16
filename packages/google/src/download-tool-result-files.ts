import type {
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
} from '@ai-sdk/provider';
import {
  cancelResponseBody,
  convertUint8ArrayToBase64,
  DownloadError,
  fetchWithValidatedRedirects,
  isUrlSupported,
  readResponseWithSizeLimit,
  type FetchFunction,
} from '@ai-sdk/provider-utils';

/**
 * Downloads a single tool result file through the validated download transport.
 *
 * `downloadBlob` does not accept a custom fetch in this release, so the
 * provider builds the blob from the same guarded primitives instead of falling
 * back to the runtime's global fetch. This keeps a caller-provided transport
 * (e.g. one that validates DNS at connect time) in effect for tool result
 * downloads and enforces a size limit on the response body.
 */
async function downloadToolResultFile(
  url: string,
  {
    abortSignal,
    fetch,
    maxBytes,
  }: {
    abortSignal: AbortSignal | undefined;
    fetch?: FetchFunction;
    maxBytes: number;
  },
): Promise<Blob> {
  try {
    const response = await fetchWithValidatedRedirects({
      url,
      abortSignal,
      fetch,
    });

    if (!response.ok) {
      // Release the connection before rejecting so an error status from an
      // attacker-controlled origin cannot leak open sockets.
      await cancelResponseBody(response);
      throw new DownloadError({
        url,
        statusCode: response.status,
        statusText: response.statusText,
      });
    }

    const data = await readResponseWithSizeLimit({ response, url, maxBytes });
    const contentType = response.headers.get('content-type') ?? undefined;

    return new Blob([data], contentType ? { type: contentType } : undefined);
  } catch (error) {
    if (DownloadError.isInstance(error)) {
      throw error;
    }

    throw new DownloadError({ url, cause: error });
  }
}

/**
 * Vertex accepts more URLs in user messages than in function responses.
 * Download tool result files that cannot be referenced in function responses.
 */
export async function downloadToolResultFiles(
  prompt: LanguageModelV3Prompt,
  {
    abortSignal,
    fetch,
    maxBytes,
    supportedUrls = {},
  }: {
    abortSignal: AbortSignal | undefined;
    /**
     * Transport used for the downloads. Defaults to the runtime's validated
     * download fetch, so pass the caller-configured fetch to keep their
     * transport (and its protections) in effect.
     */
    fetch?: FetchFunction;
    /**
     * Maximum number of bytes per downloaded file.
     */
    maxBytes: number;
    supportedUrls?: Record<string, RegExp[]>;
  },
): Promise<LanguageModelV3Prompt> {
  async function downloadOutput(
    output: LanguageModelV3ToolResultOutput,
  ): Promise<LanguageModelV3ToolResultOutput> {
    if (output.type !== 'content') {
      return output;
    }

    return {
      ...output,
      value: await Promise.all(
        output.value.map(async part => {
          if (part.type !== 'file-url' && part.type !== 'image-url') {
            return part;
          }

          if (
            part.type === 'file-url' &&
            part.mediaType != null &&
            isUrlSupported({
              url: part.url,
              mediaType: part.mediaType,
              supportedUrls,
            })
          ) {
            return part;
          }

          const blob = await downloadToolResultFile(part.url, {
            abortSignal,
            fetch,
            maxBytes,
          });
          return {
            type:
              part.type === 'file-url'
                ? ('file-data' as const)
                : ('image-data' as const),
            data: convertUint8ArrayToBase64(
              new Uint8Array(await blob.arrayBuffer()),
            ),
            mediaType:
              blob.type ||
              (part.type === 'file-url'
                ? (part.mediaType ?? 'application/octet-stream')
                : 'image/*'),
            providerOptions: part.providerOptions,
          };
        }),
      ),
    };
  }

  return Promise.all(
    prompt.map(async message => {
      switch (message.role) {
        case 'assistant':
          return {
            ...message,
            content: await Promise.all(
              message.content.map(async part =>
                part.type === 'tool-result'
                  ? { ...part, output: await downloadOutput(part.output) }
                  : part,
              ),
            ),
          };
        case 'tool':
          return {
            ...message,
            content: await Promise.all(
              message.content.map(async part =>
                part.type === 'tool-result'
                  ? { ...part, output: await downloadOutput(part.output) }
                  : part,
              ),
            ),
          };
        default:
          return message;
      }
    }),
  );
}
