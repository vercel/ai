import type {
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import {
  detectMediaType,
  downloadBlob,
  isFullMediaType,
} from '@ai-sdk/provider-utils';

/**
 * Vertex function responses only accept inline file data. Download remote tool
 * result files before converting the prompt to the Google request format.
 */
export async function downloadToolResultFiles(
  prompt: LanguageModelV4Prompt,
  abortSignal: AbortSignal | undefined,
): Promise<LanguageModelV4Prompt> {
  return await Promise.all(
    prompt.map(async message => {
      if (message.role === 'assistant') {
        return {
          ...message,
          content: await Promise.all(
            message.content.map(async part => {
              if (part.type !== 'tool-result') {
                return part;
              }

              return {
                ...part,
                output: await downloadToolResultOutput(
                  part.output,
                  abortSignal,
                ),
              };
            }),
          ),
        };
      }

      if (message.role === 'tool') {
        return {
          ...message,
          content: await Promise.all(
            message.content.map(async part => {
              if (part.type !== 'tool-result') {
                return part;
              }

              return {
                ...part,
                output: await downloadToolResultOutput(
                  part.output,
                  abortSignal,
                ),
              };
            }),
          ),
        };
      }

      return message;
    }),
  );
}

async function downloadToolResultOutput(
  output: LanguageModelV4ToolResultOutput,
  abortSignal: AbortSignal | undefined,
): Promise<LanguageModelV4ToolResultOutput> {
  if (output.type !== 'content') {
    return output;
  }

  return {
    ...output,
    value: await Promise.all(
      output.value.map(async part => {
        if (part.type !== 'file' || part.data.type !== 'url') {
          return part;
        }

        const blob = await downloadBlob(part.data.url.toString(), {
          abortSignal,
        });
        const data = new Uint8Array(await blob.arrayBuffer());
        const detectedMediaType = detectMediaType({
          data,
          topLevelType: 'image',
        });

        return {
          ...part,
          data: { type: 'data' as const, data },
          mediaType:
            detectedMediaType ??
            (blob.type && !isFullMediaType(part.mediaType)
              ? blob.type
              : part.mediaType),
        };
      }),
    ),
  };
}
