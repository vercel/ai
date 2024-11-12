import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  GoogleGenerativeAIContent,
  GoogleGenerativeAIContentPart,
  GoogleGenerativeAIPrompt,
} from './google-generative-ai-prompt';

export function convertToGoogleGenerativeAIMessages(
  prompt: LanguageModelV1Prompt,
): GoogleGenerativeAIPrompt {
  const systemInstructionParts: Array<{ text: string }> = [];
  const contents: Array<GoogleGenerativeAIContent> = [];
  let systemMessagesAllowed = true;

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

            case 'image': {
              parts.push(
                part.image instanceof URL
                  ? {
                      fileData: {
                        mimeType: part.mimeType ?? 'image/jpeg',
                        fileUri: part.image.toString(),
                      },
                    }
                  : {
                      inlineData: {
                        mimeType: part.mimeType ?? 'image/jpeg',
                        data: convertUint8ArrayToBase64(part.image),
                      },
                    },
              );

              break;
            }

            case 'file': {
              parts.push(
                part.data instanceof URL
                  ? {
                      fileData: {
                        mimeType: part.mimeType,
                        fileUri: part.data.toString(),
                      },
                    }
                  : {
                      inlineData: {
                        mimeType: part.mimeType,
                        data: part.data,
                      },
                    },
              );

              break;
            }

            default: {
              const _exhaustiveCheck: never = part;
              throw new UnsupportedFunctionalityError({
                functionality: `prompt part: ${_exhaustiveCheck}`,
              });
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
                    : { text: part.text };
                }
                case 'tool-call': {
                  return {
                    functionCall: {
                      name: part.toolName,
                      args: part.args,
                    },
                  };
                }
              }
            })
            .filter(
              part => part !== undefined,
            ) as GoogleGenerativeAIContentPart[],
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
                content: part.result,
              },
            },
          })),
        });
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    systemInstruction:
      systemInstructionParts.length > 0
        ? { parts: systemInstructionParts }
        : undefined,
    contents,
  };
}
