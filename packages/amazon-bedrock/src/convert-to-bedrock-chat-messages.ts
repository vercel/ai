import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { ContentBlock, ImageFormat } from '@aws-sdk/client-bedrock-runtime';
import { BedrockMessages, BedrockMessagesPrompt } from './bedrock-chat-prompt';

export function convertToBedrockChatMessages(
  prompt: LanguageModelV1Prompt,
): BedrockMessagesPrompt {
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
              if (part.image instanceof URL) {
                // The AI SDK automatically downloads images for user image parts with URLs
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image URLs in user messages',
                });
              }

              bedrockMessageContent.push({
                image: {
                  format: part.mimeType?.split('/')?.[1] as ImageFormat,
                  source: {
                    bytes: part.image ?? (part.image as Uint8Array),
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
            ...(text ? [{ text }] : []),
            ...toolUse.map(toolUse => ({ toolUse: toolUse })),
          ],
        });

        break;
      }

      case 'tool':
        messages.push({
          role: 'user',
          content: content.map(part => ({
            toolResult: {
              toolUseId: part.toolCallId,
              status: part.isError ? 'error' : 'success',
              content: [{ text: JSON.stringify(part.result) }],
            },
          })),
        });
        break;

      default: {
        throw new Error(`Unsupported role: ${role}`);
      }
    }
  }

  return { system, messages };
}
