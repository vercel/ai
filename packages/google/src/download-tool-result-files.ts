import type {
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
} from '@ai-sdk/provider';
import {
  convertUint8ArrayToBase64,
  downloadBlob,
  isUrlSupported,
} from '@ai-sdk/provider-utils';

/**
 * Vertex accepts more URLs in user messages than in function responses.
 * Download tool result files that cannot be referenced in function responses.
 */
export async function downloadToolResultFiles(
  prompt: LanguageModelV3Prompt,
  {
    abortSignal,
    supportedUrls = {},
  }: {
    abortSignal: AbortSignal | undefined;
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

          const blob = await downloadBlob(part.url, { abortSignal });
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
