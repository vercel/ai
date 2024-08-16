import {
  LanguageModelV1Message,
  LanguageModelV1Prompt,
  LanguageModelV1ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import {
  AnthropicAssistantMessage,
  AnthropicCacheControl,
  AnthropicMessagesPrompt,
  AnthropicUserMessage,
} from './anthropic-messages-prompt';

export function convertToAnthropicMessagesPrompt({
  prompt,
  cacheControl: isCacheControlEnabled,
}: {
  prompt: LanguageModelV1Prompt;
  cacheControl: boolean;
}): AnthropicMessagesPrompt {
  const blocks = groupIntoBlocks(prompt);

  let system: AnthropicMessagesPrompt['system'] = undefined;
  const messages: AnthropicMessagesPrompt['messages'] = [];

  function getCacheControl(
    providerMetadata: LanguageModelV1ProviderMetadata | undefined,
  ): AnthropicCacheControl | undefined {
    if (isCacheControlEnabled === false) {
      return undefined;
    }

    const anthropic = providerMetadata?.anthropic;

    // allow both cacheControl and cache_control:
    const cacheControlValue =
      anthropic?.cacheControl ?? anthropic?.cache_control;

    // Pass through value assuming it is of the correct type.
    // The Anthropic API will validate the value.
    return cacheControlValue as AnthropicCacheControl | undefined;
  }

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

        system = block.messages.map(({ content, providerMetadata }) => ({
          type: 'text',
          text: content,
          cache_control: getCacheControl(providerMetadata),
        }));

        break;
      }

      case 'user': {
        // combines all user and tool messages in this block into a single message:
        const anthropicContent: AnthropicUserMessage['content'] = [];

        for (const message of block.messages) {
          const { role, content } = message;
          switch (role) {
            case 'user': {
              for (let i = 0; i < content.length; i++) {
                const part = content[i];

                // cache control: first add cache control from part.
                // for the last part of a message,
                // check also if the message has cache control.
                const isLastPart = i === content.length - 1;

                const cacheControl =
                  getCacheControl(part.providerMetadata) ??
                  (isLastPart
                    ? getCacheControl(message.providerMetadata)
                    : undefined);

                switch (part.type) {
                  case 'text': {
                    anthropicContent.push({
                      type: 'text',
                      text: part.text,
                      cache_control: cacheControl,
                    });
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
                      cache_control: cacheControl,
                    });

                    break;
                  }
                }
              }

              break;
            }
            case 'tool': {
              for (let i = 0; i < content.length; i++) {
                const part = content[i];

                // cache control: first add cache control from part.
                // for the last part of a message,
                // check also if the message has cache control.
                const isLastPart = i === content.length - 1;

                const cacheControl =
                  getCacheControl(part.providerMetadata) ??
                  (isLastPart
                    ? getCacheControl(message.providerMetadata)
                    : undefined);

                anthropicContent.push({
                  type: 'tool_result',
                  tool_use_id: part.toolCallId,
                  content: JSON.stringify(part.result),
                  is_error: part.isError,
                  cache_control: cacheControl,
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

                  cache_control: undefined, // not used in assistant messages
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

  for (const message of prompt) {
    const { role } = message;
    switch (role) {
      case 'system': {
        if (currentBlock?.type !== 'system') {
          currentBlock = { type: 'system', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push(message);
        break;
      }
      case 'assistant': {
        if (currentBlock?.type !== 'assistant') {
          currentBlock = { type: 'assistant', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push(message);
        break;
      }
      case 'user': {
        if (currentBlock?.type !== 'user') {
          currentBlock = { type: 'user', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push(message);
        break;
      }
      case 'tool': {
        if (currentBlock?.type !== 'user') {
          currentBlock = { type: 'user', messages: [] };
          blocks.push(currentBlock);
        }

        currentBlock.messages.push(message);
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
