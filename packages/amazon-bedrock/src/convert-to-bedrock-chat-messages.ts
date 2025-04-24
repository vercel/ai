import {
  JSONObject,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  createIdGenerator,
  parseProviderOptions,
} from '@ai-sdk/provider-utils';
import {
  BEDROCK_CACHE_POINT,
  BedrockAssistantMessage,
  BedrockCachePoint,
  BedrockDocumentFormat,
  BedrockImageFormat,
  BedrockMessages,
  BedrockSystemMessages,
  BedrockUserMessage,
} from './bedrock-api-types';
import { bedrockReasoningMetadataSchema } from './bedrock-chat-language-model';

const generateFileId = createIdGenerator({ prefix: 'file', size: 16 });

function getCachePoint(
  providerMetadata: SharedV2ProviderMetadata | undefined,
): BedrockCachePoint | undefined {
  return providerMetadata?.bedrock?.cachePoint as BedrockCachePoint | undefined;
}

export async function convertToBedrockChatMessages(
  prompt: LanguageModelV2Prompt,
): Promise<{
  system: BedrockSystemMessages;
  messages: BedrockMessages;
}> {
  const blocks = groupIntoBlocks(prompt);

  let system: BedrockSystemMessages = [];
  const messages: BedrockMessages = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    const type = block.type;

    switch (type) {
      case 'system': {
        if (messages.length > 0) {
          throw new UnsupportedFunctionalityError({
            functionality:
              'Multiple system messages that are separated by user/assistant messages',
          });
        }

        for (const message of block.messages) {
          system.push({ text: message.content });
          if (getCachePoint(message.providerOptions)) {
            system.push(BEDROCK_CACHE_POINT);
          }
        }
        break;
      }

      case 'user': {
        // combines all user and tool messages in this block into a single message:
        const bedrockContent: BedrockUserMessage['content'] = [];

        for (const message of block.messages) {
          const { role, content, providerOptions } = message;
          switch (role) {
            case 'user': {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];

                switch (part.type) {
                  case 'text': {
                    bedrockContent.push({
                      text: part.text,
                    });
                    break;
                  }

                  case 'file': {
                    if (part.data instanceof URL) {
                      // The AI SDK automatically downloads files for user file parts with URLs
                      throw new UnsupportedFunctionalityError({
                        functionality: 'File URL data',
                      });
                    }

                    if (part.mediaType.startsWith('image/')) {
                      const bedrockImageFormat =
                        part.mediaType === 'image/*'
                          ? undefined
                          : part.mediaType?.split('/')?.[1];

                      bedrockContent.push({
                        image: {
                          format: bedrockImageFormat as BedrockImageFormat,
                          source: { bytes: convertToBase64(part.data) },
                        },
                      });
                    } else {
                      bedrockContent.push({
                        document: {
                          format: part.mediaType?.split(
                            '/',
                          )?.[1] as BedrockDocumentFormat,
                          name: generateFileId(),
                          source: { bytes: convertToBase64(part.data) },
                        },
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
                const toolResultContent =
                  part.content != undefined
                    ? part.content.map(part => {
                        switch (part.type) {
                          case 'text':
                            return {
                              text: part.text,
                            };
                          case 'image':
                            if (!part.mediaType) {
                              throw new Error(
                                'Image mime type is required in tool result part content',
                              );
                            }
                            const format = part.mediaType.split('/')[1];
                            if (!isBedrockImageFormat(format)) {
                              throw new Error(
                                `Unsupported image format: ${format}`,
                              );
                            }
                            return {
                              image: {
                                format,
                                source: {
                                  bytes: part.data,
                                },
                              },
                            };
                        }
                      })
                    : [{ text: JSON.stringify(part.result) }];

                bedrockContent.push({
                  toolResult: {
                    toolUseId: part.toolCallId,
                    content: toolResultContent,
                  },
                });
              }

              break;
            }
            default: {
              const _exhaustiveCheck: never = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }

          if (getCachePoint(providerOptions)) {
            bedrockContent.push(BEDROCK_CACHE_POINT);
          }
        }

        messages.push({ role: 'user', content: bedrockContent });

        break;
      }

      case 'assistant': {
        // combines multiple assistant messages in this block into a single message:
        const bedrockContent: BedrockAssistantMessage['content'] = [];

        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;

          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;

            switch (part.type) {
              case 'text': {
                bedrockContent.push({
                  text:
                    // trim the last text part if it's the last message in the block
                    // because Bedrock does not allow trailing whitespace
                    // in pre-filled assistant responses
                    trimIfLast(
                      isLastBlock,
                      isLastMessage,
                      isLastContentPart,
                      part.text,
                    ),
                });
                break;
              }

              case 'reasoning': {
                const reasoningMetadata = await parseProviderOptions({
                  provider: 'bedrock',
                  providerOptions: part.providerOptions,
                  schema: bedrockReasoningMetadataSchema,
                });

                if (reasoningMetadata != null) {
                  if (reasoningMetadata.signature != null) {
                    bedrockContent.push({
                      reasoningContent: {
                        reasoningText: {
                          // trim the last text part if it's the last message in the block
                          // because Bedrock does not allow trailing whitespace
                          // in pre-filled assistant responses
                          text: trimIfLast(
                            isLastBlock,
                            isLastMessage,
                            isLastContentPart,
                            part.text,
                          ),
                          signature: reasoningMetadata.signature,
                        },
                      },
                    });
                  } else if (reasoningMetadata.redactedData != null) {
                    bedrockContent.push({
                      reasoningContent: {
                        redactedReasoning: {
                          data: reasoningMetadata.redactedData,
                        },
                      },
                    });
                  }
                }

                break;
              }

              case 'tool-call': {
                bedrockContent.push({
                  toolUse: {
                    toolUseId: part.toolCallId,
                    name: part.toolName,
                    input: part.args as JSONObject,
                  },
                });
                break;
              }
            }
          }
          if (getCachePoint(message.providerOptions)) {
            bedrockContent.push(BEDROCK_CACHE_POINT);
          }
        }

        messages.push({ role: 'assistant', content: bedrockContent });

        break;
      }

      default: {
        const _exhaustiveCheck: never = type;
        throw new Error(`Unsupported type: ${_exhaustiveCheck}`);
      }
    }
  }

  return { system, messages };
}

function isBedrockImageFormat(format: string): format is BedrockImageFormat {
  return ['jpeg', 'png', 'gif'].includes(format);
}

function trimIfLast(
  isLastBlock: boolean,
  isLastMessage: boolean,
  isLastContentPart: boolean,
  text: string,
) {
  return isLastBlock && isLastMessage && isLastContentPart ? text.trim() : text;
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
