import {
  LanguageModelV3CallWarning,
  LanguageModelV3Prompt,
  LanguageModelV3ToolCallPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import {
  convertToBase64,
  isNonNullable,
  parseProviderOptions,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  OpenAICompatibleResponsesFunctionCallOutput,
  OpenAICompatibleResponsesInput,
  OpenAICompatibleResponsesReasoning,
} from './openai-compatible-responses-api';

/**
 * Check if a string is a file ID based on the given prefixes
 * Returns false if prefixes is undefined (disables file ID detection)
 */
function isFileId(data: string, prefixes?: readonly string[]): boolean {
  if (!prefixes) return false;
  return prefixes.some(prefix => data.startsWith(prefix));
}

export async function convertToOpenAICompatibleResponsesInput({
  prompt,
  systemMessageMode,
  fileIdPrefixes,
  store,
}: {
  prompt: LanguageModelV3Prompt;
  systemMessageMode: 'system' | 'developer';
  fileIdPrefixes?: readonly string[];
  store: boolean;
}): Promise<{
  input: OpenAICompatibleResponsesInput;
  warnings: Array<LanguageModelV3CallWarning>;
}> {
  const input: OpenAICompatibleResponsesInput = [];
  const warnings: Array<LanguageModelV3CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            input.push({ role: 'system', content });
            break;
          }
          case 'developer': {
            input.push({ role: 'developer', content });
            break;
          }
          default: {
            const _exhaustiveCheck: never = systemMessageMode;
            throw new Error(
              `Unsupported system message mode: ${_exhaustiveCheck}`,
            );
          }
        }
        break;
      }

      case 'user': {
        input.push({
          role: 'user',
          content: content.map((part, index) => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }
              case 'file': {
                if (part.mediaType.startsWith('image/')) {
                  const mediaType =
                    part.mediaType === 'image/*'
                      ? 'image/jpeg'
                      : part.mediaType;

                  return {
                    type: 'input_image',
                    ...(part.data instanceof URL
                      ? { image_url: part.data.toString() }
                      : typeof part.data === 'string' &&
                          isFileId(part.data, fileIdPrefixes)
                        ? { file_id: part.data }
                        : {
                            image_url: `data:${mediaType};base64,${convertToBase64(part.data)}`,
                          }),
                    detail:
                      part.providerOptions?.openaiCompatibleResponses
                        ?.imageDetail,
                  };
                } else if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    return {
                      type: 'input_file',
                      file_url: part.data.toString(),
                    };
                  }
                  return {
                    type: 'input_file',
                    ...(typeof part.data === 'string' &&
                    isFileId(part.data, fileIdPrefixes)
                      ? { file_id: part.data }
                      : {
                          filename: part.filename ?? `part-${index}.pdf`,
                          file_data: `data:application/pdf;base64,${convertToBase64(part.data)}`,
                        }),
                  };
                } else {
                  throw new UnsupportedFunctionalityError({
                    functionality: `file part media type ${part.mediaType}`,
                  });
                }
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
        const reasoningMessages: Record<
          string,
          OpenAICompatibleResponsesReasoning
        > = {};
        const toolCallParts: Record<string, LanguageModelV3ToolCallPart> = {};

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              const id = part.providerOptions?.openaiCompatibleResponses
                ?.itemId as string | undefined;

              // item references reduce the payload size
              if (store && id != null) {
                input.push({ type: 'item_reference', id });
                break;
              }

              input.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
                id,
              });

              break;
            }
            case 'tool-call': {
              toolCallParts[part.toolCallId] = part;

              if (part.providerExecuted) {
                break;
              }

              const id = part.providerOptions?.openaiCompatibleResponses
                ?.itemId as string | undefined;

              // item references reduce the payload size
              if (store && id != null) {
                input.push({ type: 'item_reference', id });
                break;
              }

              input.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
                id,
              });
              break;
            }

            // assistant tool result parts are from provider-executed tools:
            case 'tool-result': {
              if (store) {
                // use item references to refer to tool results from built-in tools
                input.push({ type: 'item_reference', id: part.toolCallId });
              } else {
                warnings.push({
                  type: 'other',
                  message: `Results for OpenAI tool ${part.toolName} are not sent to the API when store is false`,
                });
              }

              break;
            }

            case 'reasoning': {
              const providerOptions = await parseProviderOptions({
                provider: 'openaiCompatibleResponses',
                providerOptions: part.providerOptions,
                schema: OpenAICompatibleResponsesReasoningProviderOptionsSchema,
              });

              const reasoningId = providerOptions?.itemId;

              if (reasoningId != null) {
                const reasoningMessage = reasoningMessages[reasoningId];

                if (store) {
                  // use item references to refer to reasoning (single reference)
                  // when the first part is encountered
                  if (reasoningMessage === undefined) {
                    input.push({ type: 'item_reference', id: reasoningId });

                    // store unused reasoning message to mark id as used
                    reasoningMessages[reasoningId] = {
                      type: 'reasoning',
                      id: reasoningId,
                      summary: [],
                    };
                  }
                } else {
                  const summaryParts: Array<{
                    type: 'summary_text';
                    text: string;
                  }> = [];

                  if (part.text.length > 0) {
                    summaryParts.push({
                      type: 'summary_text',
                      text: part.text,
                    });
                  } else if (reasoningMessage !== undefined) {
                    warnings.push({
                      type: 'other',
                      message: `Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: ${JSON.stringify(part)}.`,
                    });
                  }

                  if (reasoningMessage === undefined) {
                    reasoningMessages[reasoningId] = {
                      type: 'reasoning',
                      id: reasoningId,
                      encrypted_content:
                        providerOptions?.reasoningEncryptedContent,
                      summary: summaryParts,
                    };
                    input.push(reasoningMessages[reasoningId]);
                  } else {
                    reasoningMessage.summary.push(...summaryParts);

                    // updated encrypted content to enable setting it in the last summary part:
                    if (providerOptions?.reasoningEncryptedContent != null) {
                      reasoningMessage.encrypted_content =
                        providerOptions.reasoningEncryptedContent;
                    }
                  }
                }
              } else {
                warnings.push({
                  type: 'other',
                  message: `Non-OpenAI reasoning parts are not supported. Skipping reasoning part: ${JSON.stringify(part)}.`,
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
          const output = part.output;
          let contentValue: OpenAICompatibleResponsesFunctionCallOutput['output'];
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool execution denied.';
              break;
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
            case 'content':
              contentValue = output.value
                .map(item => {
                  switch (item.type) {
                    case 'text': {
                      return { type: 'input_text' as const, text: item.text };
                    }

                    case 'image-data': {
                      return {
                        type: 'input_image' as const,
                        image_url: `data:${item.mediaType};base64,${item.data}`,
                      };
                    }

                    case 'file-data': {
                      return {
                        type: 'input_file' as const,
                        filename: item.filename ?? 'data',
                        file_data: `data:${item.mediaType};base64,${item.data}`,
                      };
                    }

                    default: {
                      warnings.push({
                        type: 'other',
                        message: `unsupported tool content part type: ${item.type}`,
                      });
                      return undefined;
                    }
                  }
                })
                .filter(isNonNullable);
              break;
          }

          input.push({
            type: 'function_call_output',
            call_id: part.toolCallId,
            output: contentValue,
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

  return { input, warnings };
}

const OpenAICompatibleResponsesReasoningProviderOptionsSchema = z.object({
  itemId: z.string().nullish(),
  reasoningEncryptedContent: z.string().nullish(),
});

export type OpenAICompatibleResponsesReasoningProviderOptions = z.infer<
  typeof OpenAICompatibleResponsesReasoningProviderOptionsSchema
>;
