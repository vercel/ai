import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64, download } from '@ai-sdk/provider-utils';
import {
  GoogleGenerativeAIContent,
  GoogleGenerativeAIContentPart,
  GoogleGenerativeAIPrompt,
} from './google-generative-ai-prompt';

export async function convertToGoogleGenerativeAIMessages({
  prompt,
  downloadImplementation = download,
}: {
  prompt: LanguageModelV1Prompt;
  downloadImplementation?: typeof download;
}): Promise<GoogleGenerativeAIPrompt> {
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
              response: part.result,
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
