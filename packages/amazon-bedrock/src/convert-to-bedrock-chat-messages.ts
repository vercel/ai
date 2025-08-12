import {
  JSONObject,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import {
  BEDROCK_CACHE_POINT,
  BEDROCK_DOCUMENT_MIME_TYPES,
  BEDROCK_IMAGE_MIME_TYPES,
  BedrockAssistantMessage,
  BedrockCachePoint,
  BedrockDocumentFormat,
  BedrockDocumentMimeType,
  BedrockImageFormat,
  BedrockImageMimeType,
  BedrockMessages,
  BedrockSystemMessages,
  BedrockUserMessage,
} from './bedrock-api-types';
import { bedrockReasoningMetadataSchema } from './bedrock-chat-language-model';

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

  let documentCounter = 0;
  const generateDocumentName = () => `document-${++documentCounter}`;

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
                      bedrockContent.push({
                        image: {
                          format: getBedrockImageFormat(part.mediaType),
                          source: { bytes: convertToBase64(part.data) },
                        },
                      });
                    } else {
                      if (!part.mediaType) {
                        throw new UnsupportedFunctionalityError({
                          functionality: 'file without mime type',
                          message:
                            'File mime type is required in user message part content',
                        });
                      }

                      bedrockContent.push({
                        document: {
                          format: getBedrockDocumentFormat(part.mediaType),
                          name: generateDocumentName(),
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
              for (const part of content) {
                let toolResultContent;

                const output = part.output;
                switch (output.type) {
                  case 'content': {
                    toolResultContent = output.value.map(contentPart => {
                      switch (contentPart.type) {
                        case 'text':
                          return { text: contentPart.text };
                        case 'media':
                          if (!contentPart.mediaType.startsWith('image/')) {
                            throw new UnsupportedFunctionalityError({
                              functionality: `media type: ${contentPart.mediaType}`,
                            });
                          }

                          const format = getBedrockImageFormat(
                            contentPart.mediaType,
                          );

                          return {
                            image: {
                              format,
                              source: { bytes: contentPart.data },
                            },
                          };
                      }
                    });
                    break;
                  }
                  case 'text':
                  case 'error-text':
                    toolResultContent = [{ text: output.value }];
                    break;
                  case 'json':
                  case 'error-json':
                  default:
                    toolResultContent = [
                      { text: JSON.stringify(output.value) },
                    ];
                    break;
                }

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
                // Skip empty text blocks
                if (!part.text.trim()) {
                  break;
                }

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
                    input: part.input as JSONObject,
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
  return Object.values(BEDROCK_IMAGE_MIME_TYPES).includes(
    format as BedrockImageFormat,
  );
}

function getBedrockImageFormat(mimeType?: string): BedrockImageFormat {
  if (!mimeType) {
    throw new UnsupportedFunctionalityError({
      functionality: 'image without mime type',
      message: 'Image mime type is required in user message part content',
    });
  }

  const format = BEDROCK_IMAGE_MIME_TYPES[mimeType as BedrockImageMimeType];
  if (!format) {
    throw new UnsupportedFunctionalityError({
      functionality: `image mime type: ${mimeType}`,
      message: `Unsupported image mime type: ${mimeType}, expected one of: ${Object.keys(BEDROCK_IMAGE_MIME_TYPES).join(', ')}`,
    });
  }

  return format;
}

function getBedrockDocumentFormat(mimeType: string): BedrockDocumentFormat {
  const format =
    BEDROCK_DOCUMENT_MIME_TYPES[mimeType as BedrockDocumentMimeType];
  if (!format) {
    throw new UnsupportedFunctionalityError({
      functionality: `file mime type: ${mimeType}`,
      message: `Unsupported file mime type: ${mimeType}, expected one of: ${Object.keys(BEDROCK_DOCUMENT_MIME_TYPES).join(', ')}`,
    });
  }
  return format;
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
