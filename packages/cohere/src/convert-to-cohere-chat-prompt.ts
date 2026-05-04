import {
  type LanguageModelV2CallWarning,
  type LanguageModelV2FilePart,
  type LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import { cohereImagePartProviderOptions } from './cohere-chat-options';
import type {
  CohereAssistantMessage,
  CohereChatPrompt,
  CohereUserMessageContent,
} from './cohere-chat-prompt';

export async function convertToCohereChatPrompt(
  prompt: LanguageModelV2Prompt,
): Promise<{
  messages: CohereChatPrompt;
  documents: Array<{
    data: { text: string; title?: string };
  }>;
  warnings: LanguageModelV2CallWarning[];
}> {
  const messages: CohereChatPrompt = [];
  const documents: Array<{ data: { text: string; title?: string } }> = [];
  const warnings: LanguageModelV2CallWarning[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        const userContentParts: Array<CohereUserMessageContent> = [];
        let hasImage = false;

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              if (part.text.length > 0) {
                userContentParts.push({ type: 'text', text: part.text });
              }
              break;
            }
            case 'file': {
              if (isImageMediaType(part.mediaType)) {
                hasImage = true;
                const url = buildImageUrl({ part });
                const cohereOptions =
                  (await parseProviderOptions({
                    provider: 'cohere',
                    providerOptions: part.providerOptions,
                    schema: cohereImagePartProviderOptions,
                  })) ?? {};

                userContentParts.push({
                  type: 'image_url',
                  image_url: {
                    url,
                    ...(cohereOptions.detail
                      ? { detail: cohereOptions.detail }
                      : {}),
                  },
                });
                break;
              }

              let textContent: string;

              if (typeof part.data === 'string') {
                textContent = part.data;
              } else if (part.data instanceof Uint8Array) {
                if (
                  !(
                    part.mediaType?.startsWith('text/') ||
                    part.mediaType === 'application/json'
                  )
                ) {
                  throw new UnsupportedFunctionalityError({
                    functionality: `document media type: ${part.mediaType}`,
                    message: `Media type '${part.mediaType}' is not supported. Supported media types are: text/* and application/json.`,
                  });
                }
                textContent = new TextDecoder().decode(part.data);
              } else {
                throw new UnsupportedFunctionalityError({
                  functionality: 'File URL data',
                  message:
                    'URLs should be downloaded by the AI SDK and not reach this point. This indicates a configuration issue.',
                });
              }

              documents.push({
                data: {
                  text: textContent,
                  title: part.filename,
                },
              });
              break;
            }
          }
        }

        if (hasImage) {
          messages.push({ role: 'user', content: userContentParts });
        } else {
          messages.push({
            role: 'user',
            content: userContentParts
              .map(p => (p.type === 'text' ? p.text : ''))
              .join(''),
          });
        }
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: CohereAssistantMessage['tool_calls'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function' as const,
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: toolCalls.length > 0 ? undefined : text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          tool_plan: undefined,
        });

        break;
      }
      case 'tool': {
        messages.push(
          ...content.map(toolResult => {
            const output = toolResult.output;

            let contentValue: string;
            switch (output.type) {
              case 'text':
              case 'error-text':
                contentValue = output.value;
                break;
              case 'content':
              case 'json':
              case 'error-json':
                contentValue = JSON.stringify(output.value);
                break;
            }

            return {
              role: 'tool' as const,
              content: contentValue,
              tool_call_id: toolResult.toolCallId,
            };
          }),
        );

        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { messages, documents, warnings };
}

function isImageMediaType(mediaType: string | undefined): boolean {
  return mediaType === 'image' || mediaType?.startsWith('image/') === true;
}

function buildImageUrl({ part }: { part: LanguageModelV2FilePart }): string {
  if (part.data instanceof URL) {
    return part.data.toString();
  }

  const mediaType =
    part.mediaType === 'image' || part.mediaType === 'image/*'
      ? 'image/jpeg'
      : part.mediaType;

  return `data:${mediaType};base64,${convertToBase64(part.data)}`;
}
