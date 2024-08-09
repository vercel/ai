import {
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  AnthropicAssistantMessage,
  AnthropicMessage,
  AnthropicMessagesPrompt,
  AnthropicUserMessage,
} from './anthropic-messages-prompt';

export function convertToAnthropicMessagesPrompt(
  prompt: LanguageModelV1Prompt,
): AnthropicMessagesPrompt {
  const blocks = groupIntoBlocks(prompt);

  let system: string | undefined = undefined;
  const messages: AnthropicMessage[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const type = block.type;

    switch (type) {
      case 'system': {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality:
              'Multiple system messages that are separated by user/assistant messages',
          });
        }

        system = block.messages.map(({ content }) => content).join('\n');
        break;
      }

      case 'user': {
        // combines all user and tool messages in this block into a single message:
        const anthropicContent: AnthropicUserMessage['content'] = [];

        for (const { role, content } of block.messages) {
          switch (role) {
            case 'user': {
              for (const part of content) {
                switch (part.type) {
                  case 'text': {
                    anthropicContent.push({ type: 'text', text: part.text });
                    break;
                  }
                  case 'image': {
                    if (part.image instanceof URL) {
                      // The AI SDK automatically downloads images for user image parts with URLs
                      throw new UnsupportedFunctionalityError({
                        functionality: 'Image URLs in user messages',
                      });
                    }

                    anthropicContent.push({
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: part.mimeType ?? 'image/jpeg',
                        data: convertUint8ArrayToBase64(part.image),
                      },
                    });

                    break;
                  }
                }
              }

              break;
            }
            case 'tool': {
              for (const part of content) {
                anthropicContent.push({
                  type: 'tool_result',
                  tool_use_id: part.toolCallId,
                  content: JSON.stringify(part.result),
                  is_error: part.isError,
                });
              }

              break;
            }
            default: {
              const _exhaustiveCheck: never = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }
        }

        messages.push({ role: 'user', content: anthropicContent });

        break;
      }

      case 'assistant': {
        // combines multiple assistant messages in this block into a single message:
        const anthropicContent: AnthropicAssistantMessage['content'] = [];

        for (const { content } of block.messages) {
          for (let j = 0; j < content.length; j++) {
            const part = content[j];
            switch (part.type) {
              case 'text': {
                anthropicContent.push({
                  type: 'text',
                  text:
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    i === blocks.length - 1 && j === block.messages.length - 1
                      ? part.text.trim()
                      : part.text,
                });
                break;
              }

              case 'tool-call': {
                anthropicContent.push({
                  type: 'tool_use',
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.args,
                });
                break;
              }
            }
          }
        }

        messages.push({ role: 'assistant', content: anthropicContent });

        break;
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    system,
    messages,
  };
}

type SystemBlock = {
  type: 'system';
  messages: Array<LanguageModelV1Message & { role: 'system' }>;
};
type AssistantBlock = {
  type: 'assistant';
  messages: Array<LanguageModelV1Message & { role: 'assistant' }>;
};
type UserBlock = {
  type: 'user';
  messages: Array<LanguageModelV1Message & { role: 'user' | 'tool' }>;
};

function groupIntoBlocks(
  prompt: LanguageModelV1Prompt,
): Array<SystemBlock | AssistantBlock | UserBlock> {
  const blocks: Array<SystemBlock | AssistantBlock | UserBlock> = [];
  let currentBlock: SystemBlock | AssistantBlock | UserBlock | undefined =
    undefined;

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        if (currentBlock?.type !== 'system') {
          currentBlock = { type: 'system', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push({ role, content });
        break;
      }
      case 'assistant': {
        if (currentBlock?.type !== 'assistant') {
          currentBlock = { type: 'assistant', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push({ role, content });
        break;
      }
      case 'user': {
        if (currentBlock?.type !== 'user') {
          currentBlock = { type: 'user', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push({ role, content });
        break;
      }
      case 'tool': {
        if (currentBlock?.type !== 'user') {
          currentBlock = { type: 'user', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push({ role, content });
        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return blocks;
}
