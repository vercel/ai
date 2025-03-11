import {
  LanguageModelV1CallWarning,
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { OpenAIResponsesPrompt } from './openai-responses-api-types';
import {
  computerActionSchema,
  computerSafetyCheckSchema,
} from './openai-responses-language-model';
import { z } from 'zod';

export function convertToOpenAIResponsesMessages({
  prompt,
  systemMessageMode,
}: {
  prompt: LanguageModelV1Prompt;
  systemMessageMode: 'system' | 'developer' | 'remove';
}): {
  messages: OpenAIResponsesPrompt;
  warnings: Array<LanguageModelV1CallWarning>;
} {
  const messages: OpenAIResponsesPrompt = [];
  const warnings: Array<LanguageModelV1CallWarning> = [];

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
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'input_text', text: part.text };
              }
              case 'image': {
                return {
                  type: 'input_image',
                  image_url:
                    part.image instanceof URL
                      ? part.image.toString()
                      : `data:${
                          part.mimeType ?? 'image/jpeg'
                        };base64,${convertUint8ArrayToBase64(part.image)}`,

                  // OpenAI specific extension: image detail
                  detail: part.providerMetadata?.openai?.imageDetail,
                };
              }
              case 'file': {
                throw new UnsupportedFunctionalityError({
                  functionality: 'Image content parts in user messages',
                });
              }
            }
          }),
        });

        break;
      }

      case 'assistant': {
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
              if (part.toolName === 'computer_use_preview') {
                // TODO proper parsing
                const args = part.args as {
                  action: z.infer<typeof computerActionSchema>;
                  pendingSafetyChecks: Array<
                    z.infer<typeof computerSafetyCheckSchema>
                  >;
                  id: string;
                  reasoning: string;
                };

                messages.push({
                  type: 'computer_call',
                  call_id: part.toolCallId,
                  id: args.id,
                  action: args.action,
                  pending_safety_checks: args.pendingSafetyChecks,
                });
              } else {
                messages.push({
                  type: 'function_call',
                  call_id: part.toolCallId,
                  name: part.toolName,
                  arguments: JSON.stringify(part.args),
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
          if (part.toolName === 'computer_use_preview') {
            // TODO proper parsing
            const result = part.result as {
              screenshot: Uint8Array;
              acknowledgedSafetyChecks: Array<
                z.infer<typeof computerSafetyCheckSchema>
              >;
            };

            messages.push({
              type: 'computer_call_output',
              call_id: part.toolCallId,
              output: {
                type: 'input_image',
                image_url: `data:image/png;base64,${convertUint8ArrayToBase64(
                  result.screenshot,
                )}`,
              },
              acknowledged_safety_checks: result.acknowledgedSafetyChecks,
            });
          } else {
            messages.push({
              type: 'function_call_output',
              call_id: part.toolCallId,
              output: JSON.stringify(part.result),
            });
          }
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
