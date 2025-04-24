import {
  LanguageModelV2CallWarning,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  AnthropicAssistantMessage,
  AnthropicCacheControl,
  AnthropicMessagesPrompt,
  AnthropicUserMessage,
} from './anthropic-api-types';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import { anthropicReasoningMetadataSchema } from './anthropic-messages-language-model';

export async function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings,
}: {
  prompt: LanguageModelV2Prompt;
  sendReasoning: boolean;
  warnings: LanguageModelV2CallWarning[];
}): Promise<{
  prompt: AnthropicMessagesPrompt;
  betas: Set<string>;
}> {
  const betas = new Set<string>();
  const blocks = groupIntoBlocks(prompt);

  let system: AnthropicMessagesPrompt['system'] = undefined;
  const messages: AnthropicMessagesPrompt['messages'] = [];

  function getCacheControl(
    providerMetadata: SharedV2ProviderMetadata | undefined,
  ): AnthropicCacheControl | undefined {
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
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;

    switch (type) {
      case 'system': {
        if (system != null) {
          throw new UnsupportedFunctionalityError({
            functionality:
              'Multiple system messages that are separated by user/assistant messages',
          });
        }

        system = block.messages.map(({ content, providerOptions }) => ({
          type: 'text',
          text: content,
          cache_control: getCacheControl(providerOptions),
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
              for (let j = 0; j < content.length; j++) {
                const part = content[j];

                // cache control: first add cache control from part.
                // for the last part of a message,
                // check also if the message has cache control.
                const isLastPart = j === content.length - 1;

                const cacheControl =
                  getCacheControl(part.providerOptions) ??
                  (isLastPart
                    ? getCacheControl(message.providerOptions)
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

                  case 'file': {
                    if (part.mediaType.startsWith('image/')) {
                      anthropicContent.push({
                        type: 'image',
                        source:
                          part.data instanceof URL
                            ? {
                                type: 'url',
                                url: part.data.toString(),
                              }
                            : {
                                type: 'base64',
                                media_type:
                                  part.mediaType === 'image/*'
                                    ? 'image/jpeg'
                                    : part.mediaType,
                                data: convertToBase64(part.data),
                              },
                        cache_control: cacheControl,
                      });
                    } else if (part.mediaType === 'application/pdf') {
                      betas.add('pdfs-2024-09-25');

                      anthropicContent.push({
                        type: 'document',
                        source:
                          part.data instanceof URL
                            ? {
                                type: 'url',
                                url: part.data.toString(),
                              }
                            : {
                                type: 'base64',
                                media_type: 'application/pdf',
                                data: convertToBase64(part.data),
                              },
                        cache_control: cacheControl,
                      });
                    } else {
                      throw new UnsupportedFunctionalityError({
                        functionality: `media type: ${part.mediaType}`,
                      });
                    }

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
                  getCacheControl(part.providerOptions) ??
                  (isLastPart
                    ? getCacheControl(message.providerOptions)
                    : undefined);

                const toolResultContent =
                  part.content != null
                    ? part.content.map(part => {
                        switch (part.type) {
                          case 'text':
                            return {
                              type: 'text' as const,
                              text: part.text,
                              cache_control: undefined,
                            };
                          case 'image':
                            return {
                              type: 'image' as const,
                              source: {
                                type: 'base64' as const,
                                media_type: part.mediaType ?? 'image/jpeg',
                                data: part.data,
                              },
                              cache_control: undefined,
                            };
                        }
                      })
                    : JSON.stringify(part.result);

                anthropicContent.push({
                  type: 'tool_result',
                  tool_use_id: part.toolCallId,
                  content: toolResultContent,
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

        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;

          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;

            // cache control: first add cache control from part.
            // for the last part of a message,
            // check also if the message has cache control.
            const cacheControl =
              getCacheControl(part.providerOptions) ??
              (isLastContentPart
                ? getCacheControl(message.providerOptions)
                : undefined);

            switch (part.type) {
              case 'text': {
                anthropicContent.push({
                  type: 'text',
                  text:
                    // trim the last text part if it's the last message in the block
                    // because Anthropic does not allow trailing whitespace
                    // in pre-filled assistant responses
                    isLastBlock && isLastMessage && isLastContentPart
                      ? part.text.trim()
                      : part.text,

                  cache_control: cacheControl,
                });
                break;
              }

              case 'reasoning': {
                if (sendReasoning) {
                  const reasoningMetadata = await parseProviderOptions({
                    provider: 'anthropic',
                    providerOptions: part.providerOptions,
                    schema: anthropicReasoningMetadataSchema,
                  });

                  if (reasoningMetadata != null) {
                    if (reasoningMetadata.signature != null) {
                      anthropicContent.push({
                        type: 'thinking',
                        thinking: part.text,
                        signature: reasoningMetadata.signature,
                        cache_control: cacheControl,
                      });
                    } else if (reasoningMetadata.redactedData != null) {
                      anthropicContent.push({
                        type: 'redacted_thinking',
                        data: reasoningMetadata.redactedData,
                        cache_control: cacheControl,
                      });
                    } else {
                      warnings.push({
                        type: 'other',
                        message: 'unsupported reasoning metadata',
                      });
                    }
                  } else {
                    warnings.push({
                      type: 'other',
                      message: 'unsupported reasoning metadata',
                    });
                  }
                } else {
                  warnings.push({
                    type: 'other',
                    message:
                      'sending reasoning content is disabled for this model',
                  });
                }
                break;
              }

              case 'tool-call': {
                anthropicContent.push({
                  type: 'tool_use',
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.args,
                  cache_control: cacheControl,
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
        throw new Error(`content type: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    prompt: { system, messages },
    betas,
  };
}

type SystemBlock = {
  type: 'system';
  messages: Array<LanguageModelV2Message & { role: 'system' }>;
};
type AssistantBlock = {
  type: 'assistant';
  messages: Array<LanguageModelV2Message & { role: 'assistant' }>;
};
type UserBlock = {
  type: 'user';
  messages: Array<LanguageModelV2Message & { role: 'user' | 'tool' }>;
};

function groupIntoBlocks(
  prompt: LanguageModelV2Prompt,
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
