import {
  LanguageModelV2CallWarning,
  LanguageModelV2DataContent,
  LanguageModelV2Message,
  LanguageModelV2Prompt,
  SharedV2ProviderMetadata,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  parseProviderOptions,
  validateTypes,
} from '@ai-sdk/provider-utils';
import {
  AnthropicAssistantMessage,
  AnthropicMessagesPrompt,
  anthropicReasoningMetadataSchema,
  AnthropicToolResultContent,
  AnthropicUserMessage,
  AnthropicWebFetchToolResultContent,
} from './anthropic-messages-api';
import { anthropicFilePartProviderOptions } from './anthropic-messages-options';
import { CacheControlValidator } from './get-cache-control';
import { codeExecution_20250522OutputSchema } from './tool/code-execution_20250522';
import { codeExecution_20250825OutputSchema } from './tool/code-execution_20250825';
import { webFetch_20250910OutputSchema } from './tool/web-fetch-20250910';
import { webSearch_20250305OutputSchema } from './tool/web-search_20250305';

function convertToString(data: LanguageModelV2DataContent): string {
  if (typeof data === 'string') {
    return Buffer.from(data, 'base64').toString('utf-8');
  }

  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }

  if (data instanceof URL) {
    throw new UnsupportedFunctionalityError({
      functionality: 'URL-based text documents are not supported for citations',
    });
  }

  throw new UnsupportedFunctionalityError({
    functionality: `unsupported data type for text documents: ${typeof data}`,
  });
}

export async function convertToAnthropicMessagesPrompt({
  prompt,
  sendReasoning,
  warnings,
  cacheControlValidator,
}: {
  prompt: LanguageModelV2Prompt;
  sendReasoning: boolean;
<<<<<<< HEAD
  warnings: LanguageModelV2CallWarning[];
=======
  warnings: LanguageModelV3CallWarning[];
  cacheControlValidator?: CacheControlValidator;
>>>>>>> ca0728506 (feat(provider/anthropic): add prompt caching validation (#9330))
}): Promise<{
  prompt: AnthropicMessagesPrompt;
  betas: Set<string>;
}> {
  const betas = new Set<string>();
  const blocks = groupIntoBlocks(prompt);
  const validator = cacheControlValidator || new CacheControlValidator();

  let system: AnthropicMessagesPrompt['system'] = undefined;
  const messages: AnthropicMessagesPrompt['messages'] = [];

  async function shouldEnableCitations(
    providerMetadata: SharedV2ProviderMetadata | undefined,
  ): Promise<boolean> {
    const anthropicOptions = await parseProviderOptions({
      provider: 'anthropic',
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions,
    });

    return anthropicOptions?.citations?.enabled ?? false;
  }

  async function getDocumentMetadata(
    providerMetadata: SharedV2ProviderMetadata | undefined,
  ): Promise<{ title?: string; context?: string }> {
    const anthropicOptions = await parseProviderOptions({
      provider: 'anthropic',
      providerOptions: providerMetadata,
      schema: anthropicFilePartProviderOptions,
    });

    return {
      title: anthropicOptions?.title,
      context: anthropicOptions?.context,
    };
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
          cache_control: validator.getCacheControl(providerOptions, {
            type: 'system message',
            canCache: true,
          }),
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
                  validator.getCacheControl(part.providerOptions, {
                    type: 'user message part',
                    canCache: true,
                  }) ??
                  (isLastPart
                    ? validator.getCacheControl(message.providerOptions, {
                        type: 'user message',
                        canCache: true,
                      })
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

                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions,
                      );

                      const metadata = await getDocumentMetadata(
                        part.providerOptions,
                      );

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
                        title: metadata.title ?? part.filename,
                        ...(metadata.context && { context: metadata.context }),
                        ...(enableCitations && {
                          citations: { enabled: true },
                        }),
                        cache_control: cacheControl,
                      });
                    } else if (part.mediaType === 'text/plain') {
                      const enableCitations = await shouldEnableCitations(
                        part.providerOptions,
                      );

                      const metadata = await getDocumentMetadata(
                        part.providerOptions,
                      );

                      anthropicContent.push({
                        type: 'document',
                        source:
                          part.data instanceof URL
                            ? {
                                type: 'url',
                                url: part.data.toString(),
                              }
                            : {
                                type: 'text',
                                media_type: 'text/plain',
                                data: convertToString(part.data),
                              },
                        title: metadata.title ?? part.filename,
                        ...(metadata.context && { context: metadata.context }),
                        ...(enableCitations && {
                          citations: { enabled: true },
                        }),
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
                  validator.getCacheControl(part.providerOptions, {
                    type: 'tool result part',
                    canCache: true,
                  }) ??
                  (isLastPart
                    ? validator.getCacheControl(message.providerOptions, {
                        type: 'tool result message',
                        canCache: true,
                      })
                    : undefined);

                const output = part.output;
                let contentValue: AnthropicToolResultContent['content'];
                switch (output.type) {
                  case 'content':
                    contentValue = output.value.map(contentPart => {
                      switch (contentPart.type) {
                        case 'text':
                          return {
                            type: 'text',
                            text: contentPart.text,
                            cache_control: undefined,
                          };
                        case 'media': {
                          if (contentPart.mediaType.startsWith('image/')) {
                            return {
<<<<<<< HEAD
                              type: 'image',
=======
                              type: 'text' as const,
                              text: contentPart.text,
                            };
                          case 'image-data': {
                            return {
                              type: 'image' as const,
>>>>>>> ca0728506 (feat(provider/anthropic): add prompt caching validation (#9330))
                              source: {
                                type: 'base64',
                                media_type: contentPart.mediaType,
                                data: contentPart.data,
                              },
<<<<<<< HEAD
                              cache_control: undefined,
                            };
                          }

                          if (contentPart.mediaType === 'application/pdf') {
                            betas.add('pdfs-2024-09-25');
=======
                            };
                          }
                          case 'file-data': {
                            if (contentPart.mediaType === 'application/pdf') {
                              betas.add('pdfs-2024-09-25');
                              return {
                                type: 'document' as const,
                                source: {
                                  type: 'base64' as const,
                                  media_type: contentPart.mediaType,
                                  data: contentPart.data,
                                },
                              };
                            }
>>>>>>> ca0728506 (feat(provider/anthropic): add prompt caching validation (#9330))

                            return {
                              type: 'document',
                              source: {
                                type: 'base64',
                                media_type: contentPart.mediaType,
                                data: contentPart.data,
                              },
                              cache_control: undefined,
                            };
                          }

                          throw new UnsupportedFunctionalityError({
                            functionality: `media type: ${contentPart.mediaType}`,
                          });
                        }
                      }
                    });
                    break;
                  case 'text':
                  case 'error-text':
                    contentValue = output.value;
                    break;
                  case 'json':
                  case 'error-json':
                  default:
                    contentValue = JSON.stringify(output.value);
                    break;
                }

                anthropicContent.push({
                  type: 'tool_result',
                  tool_use_id: part.toolCallId,
                  content: contentValue,
                  is_error:
                    output.type === 'error-text' || output.type === 'error-json'
                      ? true
                      : undefined,
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
              validator.getCacheControl(part.providerOptions, {
                type: 'assistant message part',
                canCache: true,
              }) ??
              (isLastContentPart
                ? validator.getCacheControl(message.providerOptions, {
                    type: 'assistant message',
                    canCache: true,
                  })
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
                      // Note: thinking blocks cannot have cache_control directly
                      // They are cached implicitly when in previous assistant turns
                      // Validate to provide helpful error message
                      validator.getCacheControl(part.providerOptions, {
                        type: 'thinking block',
                        canCache: false,
                      });
                      anthropicContent.push({
                        type: 'thinking',
                        thinking: part.text,
                        signature: reasoningMetadata.signature,
                      });
                    } else if (reasoningMetadata.redactedData != null) {
                      // Note: redacted thinking blocks cannot have cache_control directly
                      // They are cached implicitly when in previous assistant turns
                      // Validate to provide helpful error message
                      validator.getCacheControl(part.providerOptions, {
                        type: 'redacted thinking block',
                        canCache: false,
                      });
                      anthropicContent.push({
                        type: 'redacted_thinking',
                        data: reasoningMetadata.redactedData,
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
                if (part.providerExecuted) {
                  // code execution 20250825:
                  if (
                    part.toolName === 'code_execution' &&
                    part.input != null &&
                    typeof part.input === 'object' &&
                    'type' in part.input &&
                    typeof part.input.type === 'string' &&
                    (part.input.type === 'bash_code_execution' ||
                      part.input.type === 'text_editor_code_execution')
                  ) {
                    anthropicContent.push({
                      type: 'server_tool_use',
                      id: part.toolCallId,
                      name: part.input.type, // map back to subtool name
                      input: part.input,
                      cache_control: cacheControl,
                    });
                  } else if (
                    part.toolName === 'code_execution' || // code execution 20250522
                    part.toolName === 'web_fetch' ||
                    part.toolName === 'web_search'
                  ) {
                    anthropicContent.push({
                      type: 'server_tool_use',
                      id: part.toolCallId,
                      name: part.toolName,
                      input: part.input,
                      cache_control: cacheControl,
                    });
                  } else {
                    warnings.push({
                      type: 'other',
                      message: `provider executed tool call for tool ${part.toolName} is not supported`,
                    });
                  }

                  break;
                }

                anthropicContent.push({
                  type: 'tool_use',
                  id: part.toolCallId,
                  name: part.toolName,
                  input: part.input,
                  cache_control: cacheControl,
                });
                break;
              }

              case 'tool-result': {
                if (part.toolName === 'code_execution') {
                  const output = part.output;

                  if (output.type !== 'json') {
                    warnings.push({
                      type: 'other',
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`,
                    });

                    break;
                  }

                  if (
                    output.value == null ||
                    typeof output.value !== 'object' ||
                    !('type' in output.value) ||
                    typeof output.value.type !== 'string'
                  ) {
                    warnings.push({
                      type: 'other',
                      message: `provider executed tool result output value is not a valid code execution result for tool ${part.toolName}`,
                    });
                    break;
                  }

                  // to distinguish between code execution 20250522 and 20250825,
                  // we check if a type property is present in the output.value
                  if (output.value.type === 'code_execution_result') {
                    // code execution 20250522
                    const codeExecutionOutput = await validateTypes({
                      value: output.value,
                      schema: codeExecution_20250522OutputSchema,
                    });

                    anthropicContent.push({
                      type: 'code_execution_tool_result',
                      tool_use_id: part.toolCallId,
                      content: {
                        type: codeExecutionOutput.type,
                        stdout: codeExecutionOutput.stdout,
                        stderr: codeExecutionOutput.stderr,
                        return_code: codeExecutionOutput.return_code,
                      },
                      cache_control: cacheControl,
                    });
                  } else {
                    // code execution 20250825
                    const codeExecutionOutput = await validateTypes({
                      value: output.value,
                      schema: codeExecution_20250825OutputSchema,
                    });

                    anthropicContent.push(
                      codeExecutionOutput.type ===
                        'bash_code_execution_result' ||
                        codeExecutionOutput.type ===
                          'bash_code_execution_tool_result_error'
                        ? {
                            type: 'bash_code_execution_tool_result',
                            tool_use_id: part.toolCallId,
                            cache_control: cacheControl,
                            content: codeExecutionOutput,
                          }
                        : {
                            type: 'text_editor_code_execution_tool_result',
                            tool_use_id: part.toolCallId,
                            cache_control: cacheControl,
                            content: codeExecutionOutput,
                          },
                    );
                  }
                  break;
                }

                if (part.toolName === 'web_fetch') {
                  const output = part.output;

                  if (output.type !== 'json') {
                    warnings.push({
                      type: 'other',
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`,
                    });

                    break;
                  }

                  const webFetchOutput = await validateTypes({
                    value: output.value,
                    schema: webFetch_20250910OutputSchema,
                  });

                  anthropicContent.push({
                    type: 'web_fetch_tool_result',
                    tool_use_id: part.toolCallId,
                    content: {
                      type: 'web_fetch_result',
                      url: webFetchOutput.url,
                      retrieved_at: webFetchOutput.retrievedAt,
                      content: {
                        type: 'document',
                        title: webFetchOutput.content.title,
                        citations: webFetchOutput.content.citations,
                        source: {
                          type: webFetchOutput.content.source.type,
                          media_type: webFetchOutput.content.source.mediaType,
                          data: webFetchOutput.content.source.data,
                        } as AnthropicWebFetchToolResultContent['content']['content']['source'],
                      },
                    },
                    cache_control: cacheControl,
                  });

                  break;
                }

                if (part.toolName === 'web_search') {
                  const output = part.output;

                  if (output.type !== 'json') {
                    warnings.push({
                      type: 'other',
                      message: `provider executed tool result output type ${output.type} for tool ${part.toolName} is not supported`,
                    });

                    break;
                  }

                  const webSearchOutput = await validateTypes({
                    value: output.value,
                    schema: webSearch_20250305OutputSchema,
                  });

                  anthropicContent.push({
                    type: 'web_search_tool_result',
                    tool_use_id: part.toolCallId,
                    content: webSearchOutput.map(result => ({
                      url: result.url,
                      title: result.title,
                      page_age: result.pageAge,
                      encrypted_content: result.encryptedContent,
                      type: result.type,
                    })),
                    cache_control: cacheControl,
                  });

                  break;
                }

                warnings.push({
                  type: 'other',
                  message: `provider executed tool result for tool ${part.toolName} is not supported`,
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
