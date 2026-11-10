import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import { deepseekFilePartProviderOptions } from '../chat/deepseek-file-part-options';
import type {
  DeepSeekResponsesInput,
  DeepSeekResponsesInputContentPart,
} from './deepseek-responses-api';

export async function convertToDeepSeekResponsesInput({
  prompt,
  providerOptionsName,
}: {
  prompt: LanguageModelV4Prompt;
  providerOptionsName: string;
}): Promise<{
  input: DeepSeekResponsesInput;
  inputWarnings: SharedV4Warning[];
}> {
  const input: DeepSeekResponsesInput = [];
  const inputWarnings: SharedV4Warning[] = [];

  for (const message of prompt) {
    switch (message.role) {
      case 'system': {
        input.push({ role: 'system', content: message.content });
        break;
      }

      case 'user': {
        const content: Array<DeepSeekResponsesInputContentPart> = [];

        for (const part of message.content) {
          if (part.type === 'text') {
            content.push({ type: 'input_text', text: part.text });
          } else if (
            part.type === 'file' &&
            getTopLevelMediaType(part.mediaType) === 'image' &&
            part.data.type !== 'text'
          ) {
            content.push(
              await convertImagePart({ part, prompt, providerOptionsName }),
            );
          } else {
            inputWarnings.push({
              type: 'unsupported',
              feature: `user message part type: ${part.type}`,
            });
          }
        }

        input.push({ role: 'user', content });
        break;
      }

      case 'assistant': {
        for (const part of message.content) {
          switch (part.type) {
            case 'text': {
              if (part.text.length > 0) {
                input.push({ role: 'assistant', content: part.text });
              }
              break;
            }

            case 'reasoning': {
              const itemId = getStringOption(
                part.providerOptions?.[providerOptionsName]?.itemId,
              );
              input.push({
                type: 'reasoning',
                ...(itemId != null && { id: itemId }),
                content: [{ type: 'reasoning_text', text: part.text }],
              });
              break;
            }

            case 'tool-call': {
              if (part.providerExecuted) {
                const webSearchCall =
                  part.providerOptions?.[providerOptionsName]?.webSearchCall;
                if (isWebSearchCallItem(webSearchCall)) {
                  input.push(webSearchCall);
                }
                break;
              }

              input.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments:
                  typeof part.input === 'string'
                    ? part.input
                    : JSON.stringify(part.input),
              });
              break;
            }

            case 'tool-result': {
              break;
            }

            default: {
              inputWarnings.push({
                type: 'unsupported',
                feature: `assistant message part type: ${part.type}`,
              });
            }
          }
        }
        break;
      }

      case 'tool': {
        for (const part of message.content) {
          if (part.type === 'tool-approval-response') {
            continue;
          }

          const output = part.output;
          let value: string | Array<DeepSeekResponsesInputContentPart>;

          switch (output.type) {
            case 'text':
            case 'error-text':
              value = output.value;
              break;
            case 'execution-denied':
              value = output.reason ?? 'Tool call execution denied.';
              break;
            case 'json':
            case 'error-json':
              value = JSON.stringify(output.value);
              break;
            case 'content': {
              value = [];
              for (const item of output.value) {
                if (item.type === 'text') {
                  value.push({ type: 'input_text', text: item.text });
                } else if (
                  item.type === 'file' &&
                  getTopLevelMediaType(item.mediaType) === 'image' &&
                  item.data.type !== 'text'
                ) {
                  value.push(
                    await convertImagePart({
                      part: item,
                      prompt,
                      providerOptionsName,
                    }),
                  );
                } else {
                  inputWarnings.push({
                    type: 'unsupported',
                    feature: `tool result content part type: ${item.type}`,
                  });
                }
              }
              break;
            }
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: value,
          });
        }
        break;
      }
    }
  }

  return { input, inputWarnings };
}

const supportedImageMediaTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

async function convertImagePart({
  part,
  prompt,
  providerOptionsName,
}: {
  part: LanguageModelV4FilePart;
  prompt: LanguageModelV4Prompt;
  providerOptionsName: string;
}): Promise<DeepSeekResponsesInputContentPart> {
  if (part.data.type === 'reference') {
    return {
      type: 'input_image',
      file_id: resolveProviderReference({
        reference: part.data.reference,
        provider: 'deepseek',
      }),
    };
  }

  const filePartOptions = await parseProviderOptions({
    provider: providerOptionsName,
    providerOptions: part.providerOptions,
    schema: deepseekFilePartProviderOptions,
  });

  if (filePartOptions?.fileData === true) {
    throw new UnsupportedFunctionalityError({
      functionality: 'DeepSeek `fileData` image parts with the Responses API',
    });
  }

  const detail = filePartOptions?.imageDetail;

  if (part.data.type === 'url') {
    const url = part.data.url.toString();
    if (url.length > 8192) {
      throw new InvalidPromptError({
        prompt,
        message: 'DeepSeek image URLs must not exceed 8192 characters.',
      });
    }
    return {
      type: 'input_image',
      image_url: url,
      ...(detail != null && { detail }),
    };
  }

  if (part.data.type !== 'data') {
    throw new UnsupportedFunctionalityError({
      functionality: `DeepSeek image data type ${part.data.type}`,
    });
  }

  const mediaType = resolveFullMediaType({ part });
  if (!supportedImageMediaTypes.has(mediaType)) {
    throw new UnsupportedFunctionalityError({
      functionality: `DeepSeek image media type ${mediaType}`,
      message: 'DeepSeek supports JPEG, PNG, GIF, and WebP image inputs.',
    });
  }

  return {
    type: 'input_image',
    image_url: `data:${mediaType === 'image/jpg' ? 'image/jpeg' : mediaType};base64,${convertToBase64(part.data.data)}`,
    ...(detail != null && { detail }),
  };
}

function getStringOption(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function isWebSearchCallItem(
  value: unknown,
): value is { type: 'web_search_call' } & Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value != null &&
    !Array.isArray(value) &&
    (value as { type?: unknown }).type === 'web_search_call'
  );
}
