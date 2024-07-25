import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { Content, GenerateContentRequest, Part } from '@google-cloud/vertexai';

export function convertToGoogleVertexContentRequest(
  prompt: LanguageModelV1Prompt,
): GenerateContentRequest {
  const systemInstructionParts: Part[] = [];
  const contents: Content[] = [];
  let systemMessagesAllowed = true;

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (!systemMessagesAllowed) {
          throw new UnsupportedFunctionalityError({
            functionality: 'system messages after first user message',
          });
        }
        systemInstructionParts.push({ text: content });
        break;
      }

      case 'user': {
        systemMessagesAllowed = false;

        const parts: Content['parts'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }

            case 'image': {
              if (part.image instanceof URL) {
                // The AI SDK automatically downloads images for user image parts with URLs
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image URLs in user messages',
                });
              }

              parts.push({
                inlineData: {
                  mimeType: part.mimeType ?? 'image/jpeg',
                  data: convertUint8ArrayToBase64(part.image),
                },
              });

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
          role: 'assistant',
          parts: content
            .filter(part => part.type !== 'text' || part.text.length > 0)
            .map(part => {
              switch (part.type) {
                case 'text': {
                  return { text: part.text };
                }

                case 'tool-call': {
                  return {
                    functionCall: {
                      name: part.toolName,
                      args: part.args as object,
                    },
                  };
                }

                default: {
                  const _exhaustiveCheck: never = part;
                  throw new UnsupportedFunctionalityError({
                    functionality: `prompt part: ${_exhaustiveCheck}`,
                  });
                }
              }
            }),
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
              response: part.result as object,
            },
          })),
        });
        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new UnsupportedFunctionalityError({
          functionality: `role: ${_exhaustiveCheck}`,
        });
      }
    }
  }

  return {
    systemInstruction:
      systemInstructionParts.length > 0
        ? { role: 'system', parts: systemInstructionParts }
        : undefined,
    contents,
  };
}
