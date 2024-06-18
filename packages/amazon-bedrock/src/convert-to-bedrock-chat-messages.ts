import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { BedrockChatPrompt } from './bedrock-chat-prompt';
import { ImageBlock, ImageFormat } from '@aws-sdk/client-bedrock-runtime';

export function convertToBedrockChatMessages(
  prompt: LanguageModelV1Prompt,
): BedrockChatPrompt {
  const messages: BedrockChatPrompt = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            if (part.type === 'image' && part.image instanceof URL) {
              throw new Error(
                'Image URLs are not supported in Bedrock. Please convert the image to a base64 string.',
              );
            }

            return part.type === 'text'
              ? { text: part.text }
              : {
                  image: {
                    format: part.mimeType?.split('/')?.[1] as ImageFormat,
                    source: {
                      // TODO: support image URL
                      bytes: part.image as Uint8Array,
                    },
                  } satisfies ImageBlock,
                };
          }),
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
        throw new Error(
          `Unsupported message role '${role}'. Please use the assistant role with toolUse content block instead.`,
        );

      case 'system':
        throw new Error(
          `Unsupported message role '${role}'. Please use the system options on the provider instead.`,
        );

      default: {
        throw new Error(`Unsupported role: ${role}`);
      }
    }
  }

  return messages;
}
