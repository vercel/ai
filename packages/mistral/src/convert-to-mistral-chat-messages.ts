import {
  UnsupportedFunctionalityError,
  type LanguageModelV4FilePart,
  type LanguageModelV4Prompt,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  resolveFullMediaType,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type {
  MistralAssistantMessageContent,
  MistralPrompt,
} from './mistral-chat-prompt';

const mistralReasoningMetadataSchema = z.object({
  thinking: z.array(
    z.object({
      type: z.literal('text'),
      text: z.string(),
    }),
  ),
  closed: z.boolean().nullish(),
});

function getMistralReasoningMetadata(providerOptions: unknown) {
  const result = mistralReasoningMetadataSchema.safeParse(
    (providerOptions as { mistral?: unknown } | undefined)?.mistral,
  );

  return result.success ? result.data : undefined;
}

function formatFileUrl({ part }: { part: LanguageModelV4FilePart }): string {
  if (part.data.type === 'url') {
    return part.data.url.toString();
  }

  if (part.data.type === 'data') {
    return `data:${resolveFullMediaType({ part })};base64,${convertToBase64(part.data.data)}`;
  }

  throw new UnsupportedFunctionalityError({
    functionality: `file part data type ${part.data.type}`,
  });
}

export function convertToMistralChatMessages(
  prompt: LanguageModelV4Prompt,
): MistralPrompt {
  const messages: MistralPrompt = [];

  for (let i = 0; i < prompt.length; i++) {
    const { role, content } = prompt[i];
    const isLastMessage = i === prompt.length - 1;

    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }

              case 'file': {
                switch (part.data.type) {
                  case 'reference': {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'file parts with provider references',
                    });
                  }
                  case 'text': {
                    throw new UnsupportedFunctionalityError({
                      functionality: 'text file parts',
                    });
                  }
                  case 'url':
                  case 'data': {
                    const topLevel = getTopLevelMediaType(part.mediaType);

                    if (topLevel === 'image') {
                      return {
                        type: 'image_url',
                        image_url: formatFileUrl({ part }),
                      };
                    } else {
                      if (part.data.type === 'data') {
                        const fullMediaType = resolveFullMediaType({ part });
                        if (fullMediaType !== 'application/pdf') {
                          throw new UnsupportedFunctionalityError({
                            functionality:
                              'Only images and PDF file parts are supported',
                          });
                        }
                      } else if (part.mediaType !== 'application/pdf') {
                        throw new UnsupportedFunctionalityError({
                          functionality:
                            'Only images and PDF file parts are supported',
                        });
                      }

                      return {
                        type: 'document_url',
                        document_url: formatFileUrl({ part }),
                      };
                    }
                  }
                }
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        let text = '';
        let structuredContent:
          | Array<MistralAssistantMessageContent>
          | undefined;
        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              if (structuredContent != null) {
                structuredContent.push({ type: 'text', text: part.text });
              } else {
                text += part.text;
              }
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
            case 'reasoning': {
              const reasoningMetadata = getMistralReasoningMetadata(
                part.providerOptions,
              );

              if (reasoningMetadata != null) {
                if (structuredContent == null) {
                  structuredContent = [];
                  if (text.length > 0) {
                    structuredContent.push({ type: 'text', text });
                  }
                }

                structuredContent.push({
                  type: 'thinking',
                  thinking: reasoningMetadata.thinking,
                  ...(reasoningMetadata.closed != null
                    ? { closed: reasoningMetadata.closed }
                    : {}),
                });
              } else if (structuredContent != null) {
                structuredContent.push({ type: 'text', text: part.text });
              } else {
                text += part.text;
              }
              break;
            }
            default: {
              throw new Error(
                `Unsupported content type in assistant message: ${part.type}`,
              );
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: structuredContent ?? text,
          prefix: isLastMessage ? true : undefined,
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
            name: toolResponse.toolName,
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

  return messages;
}
