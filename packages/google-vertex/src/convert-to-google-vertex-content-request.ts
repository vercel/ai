import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64, download } from '@ai-sdk/provider-utils';
import { Content, GenerateContentRequest } from '@google-cloud/vertexai';

export async function convertToGoogleVertexContentRequest({
  prompt,
  downloadImplementation = download,
}: {
  prompt: LanguageModelV1Prompt;
  downloadImplementation?: typeof download;
}): Promise<GenerateContentRequest> {
  let systemInstruction: string | undefined = undefined;
  const contents: Content[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (systemInstruction != null) {
          throw new UnsupportedFunctionalityError({
            functionality: 'Multiple system messages',
          });
        }

        systemInstruction = content;
        break;
      }

      case 'user': {
        const parts: Content['parts'] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              parts.push({ text: part.text });
              break;
            }

            case 'image': {
              let data: Uint8Array;
              let mimeType: string | undefined;

              if (part.image instanceof URL) {
                const downloadResult = await downloadImplementation({
                  url: part.image,
                });

                data = downloadResult.data;
                mimeType = downloadResult.mimeType;
              } else {
                data = part.image;
                mimeType = part.mimeType;
              }

              parts.push({
                inlineData: {
                  mimeType: mimeType ?? 'image/jpeg',
                  data: convertUint8ArrayToBase64(data),
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
    systemInstruction,
    contents,
  };
}
