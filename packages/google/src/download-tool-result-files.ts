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
  {
    abortSignal,
    maxBytes,
  }: {
    abortSignal: AbortSignal | undefined;
    maxBytes: number;
  },
): Promise<LanguageModelV4Prompt> {
  const result: LanguageModelV4Prompt = [];

  for (const message of prompt) {
    if (message.role === 'assistant') {
      const content: typeof message.content = [];

      for (const part of message.content) {
        content.push(
          part.type === 'tool-result'
            ? {
                ...part,
                output: await downloadToolResultOutput(part.output, {
                  abortSignal,
                  maxBytes,
                }),
              }
            : part,
        );
      }

      result.push({ ...message, content });
      continue;
    }

    if (message.role === 'tool') {
      const content: typeof message.content = [];

      for (const part of message.content) {
        if (part.type !== 'tool-result') {
          content.push(part);
          continue;
        }

        content.push({
          ...part,
          output: await downloadToolResultOutput(part.output, {
            abortSignal,
            maxBytes,
          }),
        });
      }

      result.push({ ...message, content });
      continue;
    }

    result.push(message);
  }

  return result;
}

async function downloadToolResultOutput(
  output: LanguageModelV4ToolResultOutput,
  {
    abortSignal,
    maxBytes,
  }: {
    abortSignal: AbortSignal | undefined;
    maxBytes: number;
  },
): Promise<LanguageModelV4ToolResultOutput> {
  if (output.type !== 'content') {
    return output;
  }

  const value: typeof output.value = [];

  for (const part of output.value) {
    if (part.type !== 'file' || part.data.type !== 'url') {
      value.push(part);
      continue;
    }

    const blob = await downloadBlob(part.data.url.toString(), {
      abortSignal,
      maxBytes,
    });
    const data = new Uint8Array(await blob.arrayBuffer());
    const detectedMediaType = detectMediaType({
      data,
      topLevelType: 'image',
    });

    value.push({
      ...part,
      data: { type: 'data' as const, data },
      mediaType:
        detectedMediaType ??
        (blob.type && !isFullMediaType(part.mediaType)
          ? blob.type
          : part.mediaType),
    });
  }

  return {
    ...output,
    value,
  };
}
