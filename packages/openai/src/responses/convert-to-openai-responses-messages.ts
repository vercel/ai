import {
  InvalidArgumentError,
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { parseProviderOptions } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import {
  OpenAIResponsesPrompt,
  OpenAIResponsesReasoning,
} from './openai-responses-api-types';

export async function convertToOpenAIResponsesMessages({
  prompt,
  systemMessageMode,
}: {
  prompt: LanguageModelV2Prompt;
  systemMessageMode: 'system' | 'developer' | 'remove';
}): Promise<{
  messages: OpenAIResponsesPrompt;
  warnings: Array<LanguageModelV2CallWarning>;
}> {
  const messages: OpenAIResponsesPrompt = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        switch (systemMessageMode) {
          case 'system': {
            messages.push({ role: 'system', content });
            break;
          }
          case 'developer': {
            messages.push({ role: 'developer', content });
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
        messages.push({
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
                    image_url:
                      part.data instanceof URL
                        ? part.data.toString()
                        : `data:${mediaType};base64,${part.data}`,

                    // OpenAI specific extension: image detail
                    detail: part.providerOptions?.openai?.imageDetail,
                  };
                } else if (part.mediaType === 'application/pdf') {
                  if (part.data instanceof URL) {
                    // The AI SDK automatically downloads files for user file parts with URLs
                    throw new UnsupportedFunctionalityError({
                      functionality: 'PDF file parts with URLs',
                    });
                  }

                  return {
                    type: 'input_file',
                    filename: part.filename ?? `part-${index}.pdf`,
                    file_data: `data:application/pdf;base64,${part.data}`,
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

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              messages.push({
                role: 'assistant',
                content: [{ type: 'output_text', text: part.text }],
              });
              break;
            }
            case 'tool-call': {
              if (part.providerExecuted) {
                break;
              }

              messages.push({
                type: 'function_call',
                call_id: part.toolCallId,
                name: part.toolName,
                arguments: JSON.stringify(part.input),
              });
              break;
            }

            case 'tool-result': {
              warnings.push({
                type: 'other',
                message: `tool result parts in assistant messages are not supported for OpenAI responses`,
              });
              break;
            }

            case 'reasoning': {
              const providerOptions = await parseProviderOptions({
                provider: 'openai',
                providerOptions: part.providerOptions,
                schema: openaiResponsesReasoningProviderOptionsSchema,
              });

              const reasoningId = providerOptions?.reasoning?.id;

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
                      providerOptions?.reasoning?.encryptedContent,
                    summary: summaryParts,
                  };
                  messages.push(reasoningMessages[reasoningId]);
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

          messages.push({
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

  return { messages, warnings };
}

const openaiResponsesReasoningProviderOptionsSchema = z.object({
  reasoning: z
    .object({
      id: z.string().nullish(),
      encryptedContent: z.string().nullish(),
    })
    .nullish(),
});

export type OpenAIResponsesReasoningProviderOptions = z.infer<
  typeof openaiResponsesReasoningProviderOptionsSchema
>;
