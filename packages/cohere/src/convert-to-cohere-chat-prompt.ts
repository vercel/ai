import {
  UnsupportedFunctionalityError,
<<<<<<< HEAD
  type SharedV3Warning,
  type LanguageModelV3Prompt,
=======
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
  type SharedV4Warning,
>>>>>>> f2919d531 (feat(provider/cohere): add support for passing images to Cohere models (#14860))
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';
import { cohereImagePartProviderOptions } from './cohere-chat-language-model-options';
import type {
  CohereAssistantMessage,
  CohereChatPrompt,
  CohereUserMessageContent,
} from './cohere-chat-prompt';

<<<<<<< HEAD
export function convertToCohereChatPrompt(prompt: LanguageModelV3Prompt): {
=======
export async function convertToCohereChatPrompt(
  prompt: LanguageModelV4Prompt,
): Promise<{
>>>>>>> f2919d531 (feat(provider/cohere): add support for passing images to Cohere models (#14860))
  messages: CohereChatPrompt;
  documents: Array<{
    data: { text: string; title?: string };
  }>;
<<<<<<< HEAD
  warnings: SharedV3Warning[];
} {
=======
  warnings: SharedV4Warning[];
}> {
>>>>>>> f2919d531 (feat(provider/cohere): add support for passing images to Cohere models (#14860))
  const messages: CohereChatPrompt = [];
  const documents: Array<{ data: { text: string; title?: string } }> = [];
  const warnings: SharedV3Warning[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
<<<<<<< HEAD
        messages.push({
          role: 'user',
          content: content
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text;
                }
                case 'file': {
                  // Extract documents for RAG
                  let textContent: string;

                  if (typeof part.data === 'string') {
                    // Base64 or text data
                    textContent = part.data;
                  } else if (part.data instanceof Uint8Array) {
                    // Check if the media type is supported for text extraction
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
=======
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
              if (getTopLevelMediaType(part.mediaType) === 'image') {
                hasImage = true;
                const url = buildImageUrl({ part });
                const cohereOptions =
                  (await parseProviderOptions({
                    provider: 'cohere',
                    providerOptions: part.providerOptions,
                    schema: cohereImagePartProviderOptions,
                  })) ?? {};
>>>>>>> f2919d531 (feat(provider/cohere): add support for passing images to Cohere models (#14860))

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
              switch (part.data.type) {
                case 'reference': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'file parts with provider references',
                  });
<<<<<<< HEAD

                  // Files are handled separately via the documents parameter
                  // Return empty string to not include file content in message text
                  return '';
=======
                }
                case 'url': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'File URL data',
                    message:
                      'URLs should be downloaded by the AI SDK and not reach this point. This indicates a configuration issue.',
                  });
                }
                case 'text': {
                  textContent = part.data.text;
                  break;
                }
                case 'data': {
                  textContent =
                    typeof part.data.data === 'string'
                      ? part.data.data
                      : new TextDecoder().decode(part.data.data);
                  break;
>>>>>>> f2919d531 (feat(provider/cohere): add support for passing images to Cohere models (#14860))
                }
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
          ...content
            .filter(toolResult => toolResult.type !== 'tool-approval-response')
            .map(toolResult => {
              const output = toolResult.output;

              let contentValue: string;
              switch (output.type) {
                case 'text':
                case 'error-text':
                  contentValue = output.value;
                  break;
                case 'execution-denied':
                  contentValue = output.reason ?? 'Tool execution denied.';
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

function buildImageUrl({ part }: { part: LanguageModelV4FilePart }): string {
  switch (part.data.type) {
    case 'url': {
      return part.data.url.toString();
    }
    case 'data': {
      return `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`;
    }
    case 'reference': {
      throw new UnsupportedFunctionalityError({
        functionality: 'image file parts with provider references',
      });
    }
    case 'text': {
      throw new UnsupportedFunctionalityError({
        functionality: 'image file parts with text data',
      });
    }
  }
}
