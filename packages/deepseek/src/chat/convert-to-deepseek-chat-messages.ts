import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Prompt,
  type SharedV3Warning,
} from '@ai-sdk/provider';
import { convertToBase64, parseProviderOptions } from '@ai-sdk/provider-utils';
import type {
  DeepSeekChatPrompt,
  DeepSeekContentPart,
} from './deepseek-chat-api-types';
import { deepseekAssistantMessageProviderOptions } from './deepseek-chat-options';

export async function convertToDeepSeekChatMessages({
  prompt,
  responseFormat,
  modelId,
  providerOptionsName = 'deepseek',
  supportsAssistantPrefixCompletion = false,
  supportsStructuredOutputs = false,
}: {
  prompt: LanguageModelV3Prompt;
  responseFormat: LanguageModelV3CallOptions['responseFormat'];
  modelId: string;
  providerOptionsName?: string;
  supportsAssistantPrefixCompletion?: boolean;
  supportsStructuredOutputs?: boolean;
}): Promise<{
  messages: DeepSeekChatPrompt;
  warnings: Array<SharedV3Warning>;
}> {
  const isDeepSeekV4 = modelId.includes('deepseek-v4');
  const messages: DeepSeekChatPrompt = [];
  const warnings: Array<SharedV3Warning> = [];

  // Inject system message if response format is JSON
  if (responseFormat?.type === 'json') {
    if (responseFormat.schema == null) {
      messages.push({
        role: 'system',
        content: 'Return JSON.',
      });
    } else if (!supportsStructuredOutputs) {
      messages.push({
        role: 'system',
        content:
          'Return JSON that conforms to the following schema: ' +
          JSON.stringify(responseFormat.schema),
      });
      warnings.push({
        type: 'compatibility',
        feature: 'responseFormat JSON schema',
        details: 'JSON response schema is injected into the system message.',
      });
    }
  }

  // TODO use findLastIndex once we use ES2023
  let lastUserMessageIndex = -1;
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === 'user') {
      lastUserMessageIndex = i;
      break;
    }
  }

  let index = -1;
  for (const { role, content, providerOptions } of prompt) {
    index++;

    // The assistant schema extends the common message schema, so one parse
    // validates names for every role and the assistant-only prefix option.
    const deepseekMessageOptions = await parseProviderOptions({
      provider: providerOptionsName,
      providerOptions,
      schema: deepseekAssistantMessageProviderOptions,
    });

    if (deepseekMessageOptions?.prefix === true && role !== 'assistant') {
      throw new InvalidPromptError({
        prompt,
        message:
          'DeepSeek assistant prefix completion requires `prefix: true` on an assistant message.',
      });
    }

    switch (role) {
      case 'system': {
        messages.push({
          role: 'system',
          content,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
        });
        break;
      }

      case 'user': {
        const hasImagePart = content.some(
          part =>
            part.type === 'file' &&
            (part.mediaType === 'image' || part.mediaType.startsWith('image/')),
        );

        if (!hasImagePart) {
          let userContent = '';
          for (const part of content) {
            if (part.type === 'text') {
              userContent += part.text;
            } else {
              warnings.push({
                type: 'unsupported',
                feature: `user message part type: ${part.type}`,
              });
            }
          }

          messages.push({
            role: 'user',
            content: userContent,
            ...(deepseekMessageOptions?.name != null && {
              name: deepseekMessageOptions.name,
            }),
          });
          break;
        }

        const userContent: Array<DeepSeekContentPart> = [];
        for (const part of content) {
          if (part.type === 'text') {
            userContent.push({ type: 'text', text: part.text });
          } else if (
            part.type === 'file' &&
            (part.mediaType === 'image' || part.mediaType.startsWith('image/'))
          ) {
            const mediaType =
              part.mediaType === 'image' || part.mediaType === 'image/*'
                ? 'image/jpeg'
                : part.mediaType;

            userContent.push({
              type: 'image_url',
              image_url: {
                url:
                  part.data instanceof URL
                    ? part.data.toString()
                    : `data:${mediaType};base64,${convertToBase64(part.data)}`,
              },
            });
          } else {
            warnings.push({
              type: 'unsupported',
              feature: `user message part type: ${part.type}`,
            });
          }
        }

        messages.push({
          role: 'user',
          content: userContent,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
        });

        break;
      }
      case 'assistant': {
        if (deepseekMessageOptions?.prefix === true) {
          if (index !== prompt.length - 1) {
            throw new InvalidPromptError({
              prompt,
              message:
                'DeepSeek assistant prefix completion requires the prefixed assistant message to be the final message.',
            });
          }

          if (!supportsAssistantPrefixCompletion) {
            throw new UnsupportedFunctionalityError({
              functionality: 'DeepSeek assistant prefix completion',
              message:
                'DeepSeek assistant prefix completion requires a beta base URL ending in `/beta`.',
            });
          }
        }

        let text = '';
        let reasoning: string | undefined;

        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'reasoning': {
              // R1 must not receive prior reasoning; V4 requires it.
              if (index <= lastUserMessageIndex && !isDeepSeekV4) {
                break;
              }

              if (reasoning == null) {
                reasoning = part.text;
              } else {
                reasoning += part.text;
              }
              break;
            }
            case 'tool-call': {
              toolCalls.push({
                id: part.toolCallId,
                type: 'function',
                function: {
                  name: part.toolName,
                  arguments: JSON.stringify(part.input),
                },
              });
              break;
            }
          }
        }

        // V4 demands the field on every assistant turn — back-fill an empty
        // string when the source message had no reasoning part at all.
        messages.push({
          role: 'assistant',
          content: text,
          ...(deepseekMessageOptions?.name != null && {
            name: deepseekMessageOptions.name,
          }),
          ...(deepseekMessageOptions?.prefix === true && {
            prefix: true,
          }),
          reasoning_content: reasoning ?? (isDeepSeekV4 ? '' : undefined),
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        if (deepseekMessageOptions?.name != null) {
          warnings.push({
            type: 'unsupported',
            feature: 'message name on tool messages',
          });
        }

        for (const toolResponse of content) {
          if (toolResponse.type === 'tool-approval-response') {
            continue;
          }
          const output = toolResponse.output;

          let contentValue: string;
          switch (output.type) {
            case 'text':
            case 'error-text':
              contentValue = output.value;
              break;
            case 'execution-denied':
              contentValue = output.reason ?? 'Tool call execution denied.';
              break;
            case 'content':
            case 'json':
            case 'error-json':
              contentValue = JSON.stringify(output.value);
              break;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
          });
        }
        break;
      }

      default: {
        warnings.push({
          type: 'unsupported',
          feature: `message role: ${role}`,
        });
        break;
      }
    }
  }

  return { messages, warnings };
}
