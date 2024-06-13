import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { convertUint8ArrayToBase64, download } from '@ai-sdk/provider-utils';
import {
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
  const messages: GoogleGenerativeAIPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        // system message becomes user message:
        messages.push({ role: 'user', parts: [{ text: content }] });

        // required for to ensure turn-taking:
        messages.push({ role: 'model', parts: [{ text: '' }] });

        break;
      }

      case 'user': {
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
            case 'file': {
              parts.push({
                fileData: {
                  mimeType: part.mimeType ?? 'video/mp4',
                  fileUri: part.file,
                },
              });

              break;
            }
          }
        }

        messages.push({ role: 'user', parts });
        break;
      }

      case 'assistant': {
        messages.push({
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
        messages.push({
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

  return messages;
}
