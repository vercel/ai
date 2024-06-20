import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { BedrockMessages, BedrockMessagesPrompt } from './bedrock-chat-prompt';
import { ContentBlock, ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { download } from '@ai-sdk/provider-utils';

type ConvertToBedrockChatMessagesArgs = {
  prompt: LanguageModelV1Prompt;
  downloadImplementation?: typeof download;
};

export async function convertToBedrockChatMessages({
  prompt,
  downloadImplementation = download,
}: ConvertToBedrockChatMessagesArgs): Promise<BedrockMessagesPrompt> {
  let system: string | undefined = undefined;
  const messages: BedrockMessages = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality: 'Multiple system messages',
          });
        }

        system = content;
        break;
      }

      case 'user': {
        const bedrockMessageContent: ContentBlock[] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              bedrockMessageContent.push({ text: part.text });
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

              bedrockMessageContent.push({
                image: {
                  format: (mimeType ?? part.mimeType)?.split(
                    '/',
                  )?.[1] as ImageFormat,
                  source: {
                    bytes: data ?? (part.image as Uint8Array),
                  },
                },
              });
              break;
            }
          }
        }

        messages.push({
          role: 'user',
          content: bedrockMessageContent,
        });

        break;
      }

      case 'assistant': {
        const toolUse: Array<{
          toolUseId: string;
          name: string;
          input: any;
        }> = [];

        let text = '';
        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolUse.push({
                toolUseId: part.toolCallId,
                name: part.toolName,
                input: part.args,
              });
              break;
            }
            default: {
              const _exhaustiveCheck: never = part;
              throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({
          role: 'assistant',
          content: [
            { text: text },
            ...toolUse.map(toolUse => ({ toolUse: toolUse })),
          ],
        });

        break;
      }

      case 'tool':
        messages.push({
          role: 'assistant',
          content: content.map(part => ({
            toolResult: {
              toolUseId: part.toolCallId,
              status: part.isError ? 'error' : 'success',
              content: [{ text: JSON.stringify(part.result) }],
            },
          })),
        });

      default: {
        throw new Error(`Unsupported role: ${role}`);
      }
    }
  }

  return { system, messages };
}
