import {
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  LanguageModelV2ToolCallPart,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  OpenAIResponsesInput,
  OpenAIResponsesReasoning,
} from './openai-responses-api-types';
import {
  codeInterpreterInputSchema,
  codeInterpreterOutputSchema,
} from '../tool/code-interpreter';

/**
 * Check if a string is a file ID based on the given prefixes
 * Returns false if prefixes is undefined (disables file ID detection)
 */
function isFileId(data: string, prefixes?: readonly string[]): boolean {
  if (!prefixes) return false;
  return prefixes.some(prefix => data.startsWith(prefix));
}

export async function convertToOpenAIResponsesInput({
  prompt,
  systemMessageMode,
  fileIdPrefixes,
  store,
}: {
  prompt: LanguageModelV2Prompt;
  systemMessageMode: 'system' | 'developer' | 'remove';
  fileIdPrefixes?: readonly string[];
  store: boolean;
}): Promise<{
  input: OpenAIResponsesInput;
  warnings: Array<LanguageModelV2CallWarning>;
}> {
  const input: OpenAIResponsesInput = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

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
          case 'remove': {
            warnings.push({
              type: 'other',
              message: 'system messages are removed for this model',
            });
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
                    detail: part.providerOptions?.openai?.imageDetail,
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
        const reasoningMessages: Record<string, OpenAIResponsesReasoning> = {};
        const toolCallParts: Record<string, LanguageModelV2ToolCallPart> = {};

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              input.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
                id:
                  (part.providerOptions?.openai?.itemId as string) ?? undefined,
              });
              break;
            }
            case 'tool-call': {
              toolCallParts[part.toolCallId] = part;

              if (part.providerExecuted) {
                break;
              }

              input.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
                id:
                  (part.providerOptions?.openai?.itemId as string) ?? undefined,
              });
              break;
            }

            case 'tool-result': {
              // store: false -- omit
              // store: true -- item reference
              if (
                part.toolName === 'code_interpreter' &&
                part.output.type === 'json'
              ) {
                const toolCallPart = toolCallParts[part.toolCallId];
                const inputValue = codeInterpreterInputSchema.parse(
                  toolCallPart.input,
                );

                const outputValue = codeInterpreterOutputSchema.parse(
                  part.output.value,
                );

                input.push({
                  type: 'code_interpreter_call',
                  id: part.toolCallId,
                  code: inputValue.code ?? null,
                  container_id: inputValue.containerId,
                  outputs: outputValue.outputs ?? null,
                });
              } else {
                warnings.push({
                  type: 'other',
                  message: `tool result parts in assistant messages are not supported for OpenAI responses`,
                });
              }
              break;
            }

            case 'reasoning': {
              const providerOptions = await parseProviderOptions({
                provider: 'openai',
                providerOptions: part.providerOptions,
                schema: openaiResponsesReasoningProviderOptionsSchema,
              });

              const reasoningId = providerOptions?.itemId;

              if (reasoningId != null) {
                const existingReasoningMessage = reasoningMessages[reasoningId];

                const summaryParts: Array<{
                  type: 'summary_text';
                  text: string;
                }> = [];

                if (part.text.length > 0) {
                  summaryParts.push({ type: 'summary_text', text: part.text });
                } else if (existingReasoningMessage !== undefined) {
                  warnings.push({
                    type: 'other',
                    message: `Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: ${JSON.stringify(part)}.`,
                  });
                }

                if (existingReasoningMessage === undefined) {
                  reasoningMessages[reasoningId] = {
                    type: 'reasoning',
                    id: reasoningId,
                    encrypted_content:
                      providerOptions?.reasoningEncryptedContent,
                    summary: summaryParts,
                  };
                  input.push(reasoningMessages[reasoningId]);
                } else {
                  existingReasoningMessage.summary.push(...summaryParts);
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

          let contentValue: string;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
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

const openaiResponsesReasoningProviderOptionsSchema = z.object({
  itemId: z.string().nullish(),
  reasoningEncryptedContent: z.string().nullish(),
});

export type OpenAIResponsesReasoningProviderOptions = z.infer<
  typeof openaiResponsesReasoningProviderOptionsSchema
>;
