import {
  UnsupportedFunctionalityError,
  type JSONObject,
  type LanguageModelV4FilePart,
  type JSONValue,
  type LanguageModelV4Message,
  type LanguageModelV4Prompt,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  getTopLevelMediaType,
  isFullMediaType,
  parseProviderOptions,
  resolveFullMediaType,
  stripFileExtension,
} from '@ai-sdk/provider-utils';
import {
  BEDROCK_DOCUMENT_MIME_TYPES,
  BEDROCK_IMAGE_MIME_TYPES,
  BEDROCK_VIDEO_MIME_TYPES,
  type AmazonBedrockAssistantMessage,
  type AmazonBedrockCachePoint,
  type AmazonBedrockDocumentFormat,
  type AmazonBedrockDocumentMimeType,
  type AmazonBedrockImageBlock,
  type AmazonBedrockImageFormat,
  type AmazonBedrockImageMimeType,
  type AmazonBedrockMessages,
  type AmazonBedrockSystemMessages,
  type AmazonBedrockUserMessage,
  type AmazonBedrockVideoBlock,
  type AmazonBedrockVideoFormat,
  type AmazonBedrockVideoMimeType,
} from './amazon-bedrock-api-types';
import {
  amazonBedrockFilePartProviderOptions,
  amazonBedrockImagePartProviderOptions,
  amazonBedrockTextPartProviderOptions,
} from './amazon-bedrock-chat-language-model-options';
import { amazonBedrockReasoningMetadataSchema } from './amazon-bedrock-reasoning-metadata';
import { normalizeToolCallId } from './normalize-tool-call-id';

function getCachePoint(
  providerMetadata: SharedV4ProviderMetadata | undefined,
): AmazonBedrockCachePoint | undefined {
  const cachePointConfig = (providerMetadata?.amazonBedrock?.cachePoint ??
    providerMetadata?.bedrock?.cachePoint) as
    | AmazonBedrockCachePoint['cachePoint']
    | undefined;

  if (!cachePointConfig) {
    return undefined;
  }

  return { cachePoint: cachePointConfig };
}

function pushCachePoint(
  content:
    | AmazonBedrockUserMessage['content']
    | AmazonBedrockAssistantMessage['content'],
  providerMetadata: SharedV4ProviderMetadata | undefined,
) {
  const cachePoint = getCachePoint(providerMetadata);
  if (cachePoint) {
    content.push(cachePoint);
  }
}

function sanitizeToolName(toolName: string): string {
  return toolName.replace(/[^a-zA-Z0-9_-]/g, '') || '_';
}

function getAmazonBedrockMediaSource({
  data,
  functionality,
}: {
  data: Extract<LanguageModelV4FilePart['data'], { type: 'data' | 'url' }>;
  functionality: string;
}):
  | AmazonBedrockImageBlock['image']['source']
  | AmazonBedrockVideoBlock['video']['source'] {
  switch (data.type) {
    case 'data':
      return { bytes: convertToBase64(data.data) };
    case 'url':
      if (data.url.protocol !== 's3:') {
        throw new UnsupportedFunctionalityError({ functionality });
      }
      return {
        s3Location: {
          uri: data.url.toString(),
        },
      };
  }
}

async function shouldEnableCitations(
  providerMetadata: SharedV4ProviderMetadata | undefined,
): Promise<boolean> {
  const amazonBedrockOptions =
    (await parseProviderOptions({
      provider: 'amazonBedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockFilePartProviderOptions,
    })) ??
    (await parseProviderOptions({
      provider: 'bedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockFilePartProviderOptions,
    }));

  return amazonBedrockOptions?.citations?.enabled ?? false;
}

async function getTextPartGuardContentOptions(
  providerMetadata: SharedV4ProviderMetadata | undefined,
) {
  return (
    (await parseProviderOptions({
      provider: 'amazonBedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockTextPartProviderOptions,
    })) ??
    (await parseProviderOptions({
      provider: 'bedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockTextPartProviderOptions,
    }))
  );
}

async function getImagePartGuardContentOptions(
  providerMetadata: SharedV4ProviderMetadata | undefined,
) {
  return (
    (await parseProviderOptions({
      provider: 'amazonBedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockImagePartProviderOptions,
    })) ??
    (await parseProviderOptions({
      provider: 'bedrock',
      providerOptions: providerMetadata,
      schema: amazonBedrockImagePartProviderOptions,
    }))
  );
}

export async function convertToAmazonBedrockChatMessages(
  prompt: LanguageModelV4Prompt,
  isMistral: boolean = false,
): Promise<{
  system: AmazonBedrockSystemMessages;
  messages: AmazonBedrockMessages;
}> {
  const blocks = groupIntoBlocks(prompt);

  let system: AmazonBedrockSystemMessages = [];
  const messages: AmazonBedrockMessages = [];

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
          const cachePoint = getCachePoint(message.providerOptions);
          if (cachePoint) {
            system.push(cachePoint);
          }
        }
        break;
      }

      case 'user': {
        // combines all user and tool messages in this block into a single message:
        const amazonBedrockContent: AmazonBedrockUserMessage['content'] = [];

        for (const message of block.messages) {
          const { role, content, providerOptions } = message;
          switch (role) {
            case 'user': {
              for (let j = 0; j < content.length; j++) {
                const part = content[j];

                switch (part.type) {
                  case 'text': {
                    const textOptions = await getTextPartGuardContentOptions(
                      part.providerOptions,
                    );

                    if (textOptions?.guardContent) {
                      amazonBedrockContent.push({
                        guardContent: {
                          text: {
                            text: part.text,
                            qualifiers: textOptions.guardContentQualifiers,
                          },
                        },
                      });
                    } else {
                      amazonBedrockContent.push({
                        text: part.text,
                      });
                    }
                    break;
                  }

                  case 'file': {
                    switch (part.data.type) {
                      case 'reference': {
                        throw new UnsupportedFunctionalityError({
                          functionality: 'file parts with provider references',
                        });
                      }
                      case 'url': {
                        if (part.data.url.protocol !== 's3:') {
                          throw new UnsupportedFunctionalityError({
                            functionality: 'File URL data',
                          });
                        }

                        const fullMediaType = resolveFullMediaType({ part });

                        switch (getTopLevelMediaType(fullMediaType)) {
                          case 'image': {
                            amazonBedrockContent.push({
                              image: {
                                format:
                                  getAmazonBedrockImageFormat(fullMediaType),
                                source: getAmazonBedrockMediaSource({
                                  data: part.data,
                                  functionality: 'File URL data',
                                }),
                              },
                            });
                            break;
                          }
                          case 'video': {
                            amazonBedrockContent.push({
                              video: {
                                format:
                                  getAmazonBedrockVideoFormat(fullMediaType),
                                source: getAmazonBedrockMediaSource({
                                  data: part.data,
                                  functionality: 'File URL data',
                                }),
                              },
                            });
                            break;
                          }
                          default: {
                            throw new UnsupportedFunctionalityError({
                              functionality: 'File URL data',
                            });
                          }
                        }
                        break;
                      }
                      case 'text': {
                        const textMediaType = isFullMediaType(part.mediaType)
                          ? part.mediaType
                          : 'text/plain';
                        const enableCitations = await shouldEnableCitations(
                          part.providerOptions,
                        );

                        amazonBedrockContent.push({
                          document: {
                            format:
                              getAmazonBedrockDocumentFormat(textMediaType),
                            name: part.filename
                              ? stripFileExtension(part.filename)
                              : generateDocumentName(),
                            source: {
                              bytes: convertToBase64(
                                new TextEncoder().encode(part.data.text),
                              ),
                            },
                            ...(enableCitations && {
                              citations: { enabled: true },
                            }),
                          },
                        });
                        break;
                      }
                      case 'data': {
                        const fullMediaType = resolveFullMediaType({ part });

                        switch (getTopLevelMediaType(fullMediaType)) {
                          case 'image': {
                            const imageOptions =
                              await getImagePartGuardContentOptions(
                                part.providerOptions,
                              );
                            const imageBlock: AmazonBedrockImageBlock = {
                              image: {
                                format:
                                  getAmazonBedrockImageFormat(fullMediaType),
                                source: getAmazonBedrockMediaSource({
                                  data: part.data,
                                  functionality: 'File URL data',
                                }),
                              },
                            };

                            if (imageOptions?.guardContent) {
                              amazonBedrockContent.push({
                                guardContent: imageBlock,
                              });
                            } else {
                              amazonBedrockContent.push(imageBlock);
                            }
                            break;
                          }
                          case 'video': {
                            amazonBedrockContent.push({
                              video: {
                                format:
                                  getAmazonBedrockVideoFormat(fullMediaType),
                                source: getAmazonBedrockMediaSource({
                                  data: part.data,
                                  functionality: 'File URL data',
                                }),
                              },
                            });
                            break;
                          }
                          default: {
                            const enableCitations = await shouldEnableCitations(
                              part.providerOptions,
                            );

                            amazonBedrockContent.push({
                              document: {
                                format:
                                  getAmazonBedrockDocumentFormat(fullMediaType),
                                name: part.filename
                                  ? stripFileExtension(part.filename)
                                  : generateDocumentName(),
                                source: {
                                  bytes: convertToBase64(part.data.data),
                                },
                                ...(enableCitations && {
                                  citations: { enabled: true },
                                }),
                              },
                            });
                          }
                        }
                        break;
                      }
                    }

                    break;
                  }
                }

                pushCachePoint(amazonBedrockContent, part.providerOptions);
              }

              break;
            }
            case 'tool': {
              for (const part of content) {
                if (part.type === 'tool-approval-response') {
                  continue;
                }
                let toolResultContent;

                const output = part.output;
                switch (output.type) {
                  case 'content': {
                    toolResultContent = await Promise.all(
                      output.value.map(async contentPart => {
                        switch (contentPart.type) {
                          case 'text':
                            return { text: contentPart.text };
                          case 'file': {
                            if (
                              contentPart.data.type !== 'data' &&
                              (contentPart.data.type !== 'url' ||
                                contentPart.data.url.protocol !== 's3:')
                            ) {
                              throw new UnsupportedFunctionalityError({
                                functionality: `tool result file data of type "${contentPart.data.type}"`,
                              });
                            }

                            const fullMediaType = resolveFullMediaType({
                              part: contentPart,
                            });

                            switch (getTopLevelMediaType(fullMediaType)) {
                              case 'image': {
                                return {
                                  image: {
                                    format:
                                      getAmazonBedrockImageFormat(
                                        fullMediaType,
                                      ),
                                    source: getAmazonBedrockMediaSource({
                                      data: contentPart.data,
                                      functionality: `tool result file data of type "${contentPart.data.type}"`,
                                    }),
                                  },
                                };
                              }
                              case 'video': {
                                return {
                                  video: {
                                    format:
                                      getAmazonBedrockVideoFormat(
                                        fullMediaType,
                                      ),
                                    source: getAmazonBedrockMediaSource({
                                      data: contentPart.data,
                                      functionality: `tool result file data of type "${contentPart.data.type}"`,
                                    }),
                                  },
                                };
                              }
                              default: {
                                if (contentPart.data.type !== 'data') {
                                  throw new UnsupportedFunctionalityError({
                                    functionality: `tool result file data of type "${contentPart.data.type}"`,
                                  });
                                }

                                const enableCitations =
                                  await shouldEnableCitations(
                                    contentPart.providerOptions,
                                  );

                                return {
                                  document: {
                                    format:
                                      getAmazonBedrockDocumentFormat(
                                        fullMediaType,
                                      ),
                                    name: contentPart.filename
                                      ? stripFileExtension(contentPart.filename)
                                      : generateDocumentName(),
                                    source: {
                                      bytes: convertToBase64(
                                        contentPart.data.data,
                                      ),
                                    },
                                    ...(enableCitations && {
                                      citations: { enabled: true },
                                    }),
                                  },
                                };
                              }
                            }
                          }
                          default: {
                            throw new UnsupportedFunctionalityError({
                              functionality: `unsupported tool content part type: ${contentPart.type}`,
                            });
                          }
                        }
                      }),
                    );
                    break;
                  }
                  case 'text':
                  case 'error-text':
                    toolResultContent = [{ text: output.value }];
                    break;
                  case 'execution-denied':
                    toolResultContent = [
                      { text: output.reason ?? 'Tool call execution denied.' },
                    ];
                    break;
                  case 'json':
                  case 'error-json':
                  default:
                    toolResultContent = [
                      { text: JSON.stringify(output.value) },
                    ];
                    break;
                }

                amazonBedrockContent.push({
                  toolResult: {
                    toolUseId: normalizeToolCallId(part.toolCallId, isMistral),
                    content: toolResultContent,
                  },
                });
                pushCachePoint(amazonBedrockContent, part.providerOptions);
              }

              break;
            }
            default: {
              const _exhaustiveCheck: never = role;
              throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
            }
          }

          pushCachePoint(amazonBedrockContent, providerOptions);
        }

        messages.push({ role: 'user', content: amazonBedrockContent });

        break;
      }

      case 'assistant': {
        // combines multiple assistant messages in this block into a single message:
        const amazonBedrockContent: AmazonBedrockAssistantMessage['content'] =
          [];

        for (let j = 0; j < block.messages.length; j++) {
          const message = block.messages[j];
          const isLastMessage = j === block.messages.length - 1;
          const { content } = message;
          const hasReasoningBlocks = content.some(
            part => part.type === 'reasoning',
          );

          for (let k = 0; k < content.length; k++) {
            const part = content[k];
            const isLastContentPart = k === content.length - 1;

            switch (part.type) {
              case 'text': {
                // Skip empty text blocks unless reasoning blocks are present
                if (!part.text.trim() && !hasReasoningBlocks) {
                  break;
                }

                amazonBedrockContent.push({
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
                const reasoningMetadata =
                  (await parseProviderOptions({
                    provider: 'amazonBedrock',
                    providerOptions: part.providerOptions,
                    schema: amazonBedrockReasoningMetadataSchema,
                  })) ??
                  (await parseProviderOptions({
                    provider: 'bedrock',
                    providerOptions: part.providerOptions,
                    schema: amazonBedrockReasoningMetadataSchema,
                  }));

                if (reasoningMetadata?.signature != null) {
                  // do not trim reasoning text when a signature is present:
                  // the signature validates the exact original bytes
                  amazonBedrockContent.push({
                    reasoningContent: {
                      reasoningText: {
                        text: part.text,
                        signature: reasoningMetadata.signature,
                      },
                    },
                  });
                } else if (reasoningMetadata?.redactedContent != null) {
                  amazonBedrockContent.push({
                    reasoningContent: {
                      redactedContent: reasoningMetadata.redactedContent,
                    },
                  });
                } else if (reasoningMetadata?.redactedData != null) {
                  amazonBedrockContent.push({
                    reasoningContent: {
                      redactedReasoning: {
                        data: reasoningMetadata.redactedData,
                      },
                    },
                  });
                }
                // Unsigned reasoning is intentionally not replayed. Some
                // Bedrock models (for example OpenAI gpt-oss) return reasoning
                // without a signature; sending it back in multi-turn tool use
                // can leak raw reasoning into the visible response.
                break;
              }

              case 'tool-call': {
                amazonBedrockContent.push({
                  toolUse: {
                    toolUseId: normalizeToolCallId(part.toolCallId, isMistral),
                    name: sanitizeToolName(part.toolName),
                    input: toBedrockToolInput(part.input),
                  },
                });
                break;
              }
            }

            pushCachePoint(amazonBedrockContent, part.providerOptions);
          }
          pushCachePoint(amazonBedrockContent, message.providerOptions);
        }

        if (amazonBedrockContent.some(block => !('cachePoint' in block))) {
          messages.push({ role: 'assistant', content: amazonBedrockContent });
        }

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

// wrap invalid tool call input because Bedrock requires it to be an object
function toBedrockToolInput(input: unknown): JSONObject {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
    ? (input as JSONObject)
    : { rawInvalidInput: input as JSONValue };
}

function getAmazonBedrockImageFormat(
  mimeType: string,
): AmazonBedrockImageFormat {
  const format =
    BEDROCK_IMAGE_MIME_TYPES[mimeType as AmazonBedrockImageMimeType];
  if (!format) {
    throw new UnsupportedFunctionalityError({
      functionality: `image mime type: ${mimeType}`,
      message: `Unsupported image mime type: ${mimeType}, expected one of: ${Object.keys(BEDROCK_IMAGE_MIME_TYPES).join(', ')}`,
    });
  }

  return format;
}

function getAmazonBedrockDocumentFormat(
  mimeType: string,
): AmazonBedrockDocumentFormat {
  const format =
    BEDROCK_DOCUMENT_MIME_TYPES[mimeType as AmazonBedrockDocumentMimeType];
  if (!format) {
    throw new UnsupportedFunctionalityError({
      functionality: `file mime type: ${mimeType}`,
      message: `Unsupported file mime type: ${mimeType}, expected one of: ${Object.keys(BEDROCK_DOCUMENT_MIME_TYPES).join(', ')}`,
    });
  }
  return format;
}

function getAmazonBedrockVideoFormat(
  mimeType: string,
): AmazonBedrockVideoFormat {
  const format =
    BEDROCK_VIDEO_MIME_TYPES[mimeType as AmazonBedrockVideoMimeType];
  if (!format) {
    throw new UnsupportedFunctionalityError({
      functionality: `video mime type: ${mimeType}`,
      message: `Unsupported video mime type: ${mimeType}, expected one of: ${Object.keys(BEDROCK_VIDEO_MIME_TYPES).join(', ')}`,
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
  messages: Array<LanguageModelV4Message & { role: 'system' }>;
};
type AssistantBlock = {
  type: 'assistant';
  messages: Array<LanguageModelV4Message & { role: 'assistant' }>;
};
type UserBlock = {
  type: 'user';
  messages: Array<LanguageModelV4Message & { role: 'user' | 'tool' }>;
};

function groupIntoBlocks(
  prompt: LanguageModelV4Prompt,
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
