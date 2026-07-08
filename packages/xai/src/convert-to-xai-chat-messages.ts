import {
  UnsupportedFunctionalityError,
  type SharedV3Warning,
  type LanguageModelV3Prompt,
} from '@ai-sdk/provider';
<<<<<<< HEAD
import { convertToBase64 } from '@ai-sdk/provider-utils';
import type { XaiChatPrompt } from './xai-chat-prompt';

export function convertToXaiChatMessages(prompt: LanguageModelV3Prompt): {
  messages: XaiChatPrompt;
  warnings: Array<SharedV3Warning>;
} {
=======
import {
  convertToBase64,
  getTopLevelMediaType,
  parseProviderOptions,
  resolveFullMediaType,
  resolveProviderReference,
} from '@ai-sdk/provider-utils';
import type { XaiChatPrompt, XaiUserMessageContent } from './xai-chat-prompt';
import { xaiFilePartProviderOptions } from './xai-file-part-options';

export async function convertToXaiChatMessages(
  prompt: LanguageModelV4Prompt,
): Promise<{
  messages: XaiChatPrompt;
  warnings: Array<SharedV4Warning>;
}> {
>>>>>>> 72eee24a7a (feat(provider/xai): support `imageDetail` provider option on image file parts (#16895))
  const messages: XaiChatPrompt = [];
  const warnings: Array<SharedV3Warning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        if (content.length === 1 && content[0].type === 'text') {
          messages.push({ role: 'user', content: content[0].text });
          break;
        }

<<<<<<< HEAD
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

                  return {
                    type: 'image_url',
                    image_url: {
                      url:
                        part.data instanceof URL
                          ? part.data.toString()
                          : `data:${mediaType};base64,${convertToBase64(part.data)}`,
                    },
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
=======
        const userContent: Array<XaiUserMessageContent> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              userContent.push({ type: 'text', text: part.text });
              break;
            }
            case 'file': {
              switch (part.data.type) {
                case 'reference': {
                  userContent.push({
                    type: 'file',
                    file: {
                      file_id: resolveProviderReference({
                        reference: part.data.reference,
                        provider: 'xai',
                      }),
                    },
                  });
                  break;
                }
                case 'text': {
                  throw new UnsupportedFunctionalityError({
                    functionality: 'text file parts',
                  });
                }
                case 'url':
                case 'data': {
                  if (getTopLevelMediaType(part.mediaType) === 'image') {
                    const filePartOptions = await parseProviderOptions({
                      provider: 'xai',
                      providerOptions: part.providerOptions,
                      schema: xaiFilePartProviderOptions,
                    });

                    userContent.push({
                      type: 'image_url',
                      image_url: {
                        url:
                          part.data.type === 'url'
                            ? part.data.url.toString()
                            : `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`,
                        ...(filePartOptions?.imageDetail != null && {
                          detail: filePartOptions.imageDetail,
                        }),
                      },
                    });
                  } else {
                    throw new UnsupportedFunctionalityError({
                      functionality: `file part media type ${part.mediaType}`,
                    });
                  }
                  break;
>>>>>>> 72eee24a7a (feat(provider/xai): support `imageDetail` provider option on image file parts (#16895))
                }
              }
              break;
            }
          }
        }

        messages.push({ role: 'user', content: userContent });

        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
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
          content: text,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          if (toolResponse.type === 'tool-approval-response') {
            continue;
          }
          const output = toolResponse.output;

          let contentValue: string;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool call execution denied.';
              break;
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
          });
        }
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return { messages, warnings };
}
