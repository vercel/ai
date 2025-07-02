import {
  InvalidPromptError,
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
        // Track reasoning messages within this assistant message by ID.
        // This allows multiple consecutive reasoning parts with the same ID to be merged into a single reasoning message with combined summaries.
        let currentReasoningMessages: Record<string, OpenAIResponsesReasoning> =
          {};

        for (const part of content) {
          if (part.type !== 'reasoning') {
            // Reset reasoning state when encountering non-reasoning content.
            // This ensures that reasoning parts separated by non-reasoning content are treated as separate reasoning sequences.
            // This supports alternating patterns like:
            // reasoning → reasoning → tool-call → tool-result → reasoning → reasoning → reasoning → tool-call → tool-result → ... → text.
            currentReasoningMessages = {};
          }

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
              if (providerOptions === undefined) {
                throw new InvalidPromptError({
                  prompt: part,
                  message:
                    'Reasoning parts require providerOptions: { openai: { reasoning: { id: "..." } } }',
                });
              }
              const reasoningId = providerOptions.reasoning.id;
              const existingReasoningMessage =
                currentReasoningMessages[reasoningId];
              if (existingReasoningMessage === undefined) {
                const newReasoningMessage = {
                  type: 'reasoning' as const,
                  id: providerOptions.reasoning.id,
                  encrypted_content: providerOptions.reasoning.encryptedContent,
                  summary:
                    part.text.length > 0
                      ? [{ type: 'summary_text' as const, text: part.text }]
                      : [],
                } satisfies OpenAIResponsesReasoning;
                currentReasoningMessages[reasoningId] = newReasoningMessage;
                messages.push(newReasoningMessage);
              } else {
                if (
                  existingReasoningMessage.encrypted_content !==
                  providerOptions.reasoning.encryptedContent
                ) {
                  throw new InvalidPromptError({
                    prompt: part,
                    message:
                      'Consecutive reasoning parts with same ID must have matching encrypted content', // Because they will be merged into a single reasoning message.
                  });
                }
                if (part.text.length > 0) {
                  existingReasoningMessage.summary.push({
                    type: 'summary_text' as const,
                    text: part.text,
                  });
                }
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
  reasoning: z.object({
    id: z.string(),
    encryptedContent: z.string().nullish(),
  }),
});

export type OpenAIResponsesReasoningProviderOptions = z.infer<
  typeof openaiResponsesReasoningProviderOptionsSchema
>;
