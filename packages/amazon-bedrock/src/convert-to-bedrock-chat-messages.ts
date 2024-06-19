import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { BedrockMessages, BedrockMessagesPrompt } from './bedrock-chat-prompt';
import {
  ImageBlock,
  ImageFormat,
  ToolResultBlock,
  ToolUseBlock,
} from '@aws-sdk/client-bedrock-runtime';

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
