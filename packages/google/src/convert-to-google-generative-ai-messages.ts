import {
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  GoogleGenerativeAIContent,
  GoogleGenerativeAIContentPart,
  GoogleGenerativeAIPrompt,
} from './google-generative-ai-prompt';
import { convertToBase64 } from '@ai-sdk/provider-utils';

export function convertToGoogleGenerativeAIMessages(
  prompt: LanguageModelV2Prompt,
  options?: { isGemmaModel?: boolean },
): GoogleGenerativeAIPrompt {
  const systemInstructionParts: Array<{ text: string }> = [];
  const contents: Array<GoogleGenerativeAIContent> = [];
  let systemMessagesAllowed = true;
  const isGemmaModel = options?.isGemmaModel ?? false;

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality:
              'system messages are only supported at the beginning of the conversation',
          });
        }

        systemInstructionParts.push({ text: content });
        break;
      }

      case 'user': {
        systemMessagesAllowed = false;

        const parts: GoogleGenerativeAIContentPart[] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }

            case 'file': {
              // default to image/jpeg for unknown image/* types
              const mediaType =
                part.mediaType === 'image/*' ? 'image/jpeg' : part.mediaType;

              parts.push(
                part.data instanceof URL
                  ? {
                      fileData: {
                        mimeType: mediaType,
                        fileUri: part.data.toString(),
                      },
                    }
                  : {
                      inlineData: {
                        mimeType: mediaType,
                        data: convertToBase64(part.data),
                      },
                    },
              );

              break;
            }
          }
        }

        contents.push({ role: 'user', parts });
        break;
      }

      case 'assistant': {
        systemMessagesAllowed = false;

        contents.push({
          role: 'model',
          parts: content
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return part.text.length === 0
                    ? undefined
                    : {
                        text: part.text,
                        thoughtSignature:
                          part.providerOptions?.google?.thoughtSignature,
                      };
                }

                case 'reasoning': {
                  return part.text.length === 0
                    ? undefined
                    : {
                        text: part.text,
                        thought: true,
                        thoughtSignature:
                          part.providerOptions?.google?.thoughtSignature,
                      };
                }

                case 'file': {
                  if (part.mediaType !== 'image/png') {
                    throw new UnsupportedFunctionalityError({
                      functionality:
                        'Only PNG images are supported in assistant messages',
                    });
                  }

                  if (part.data instanceof URL) {
                    throw new UnsupportedFunctionalityError({
                      functionality:
                        'File data URLs in assistant messages are not supported',
                    });
                  }

                  return {
                    inlineData: {
                      mimeType: part.mediaType,
                      data: convertToBase64(part.data),
                    },
                  };
                }

                case 'tool-call': {
                  return {
                    functionCall: {
                      name: part.toolName,
                      args: part.input,
                    },
                    thoughtSignature:
                      part.providerOptions?.google?.thoughtSignature,
                  };
                }
              }
            })
            .filter(part => part !== undefined),
        });
        break;
      }

      case 'tool': {
        systemMessagesAllowed = false;

        contents.push({
          role: 'user',
          parts: content.map(part => ({
            functionResponse: {
              name: part.toolName,
              response: {
                name: part.toolName,
                content: part.output.value,
              },
            },
          })),
        });
        break;
      }
    }
  }

  if (
    isGemmaModel &&
    systemInstructionParts.length > 0 &&
    contents.length > 0 &&
    contents[0].role === 'user'
  ) {
    const systemText = systemInstructionParts
      .map(part => part.text)
      .join('\n\n');

    contents[0].parts.unshift({ text: systemText + '\n\n' });
  }

  return {
    systemInstruction:
      systemInstructionParts.length > 0 && !isGemmaModel
        ? { parts: systemInstructionParts }
        : undefined,
    contents,
  };
}
