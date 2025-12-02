import {
  LanguageModelV2CallOptions,
  LanguageModelV2CallWarning,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { DeepSeekChatPrompt } from './deepseek-chat-api-types';

export function convertToDeepSeekChatMessages({
  prompt,
  responseFormat,
}: {
  prompt: LanguageModelV2Prompt;
  responseFormat: LanguageModelV2CallOptions['responseFormat'];
}): {
  messages: DeepSeekChatPrompt;
  warnings: Array<LanguageModelV2CallWarning>;
} {
  const messages: DeepSeekChatPrompt = [];
  const warnings: Array<LanguageModelV2CallWarning> = [];

  // Inject system message if response format is JSON
  if (responseFormat?.type === 'json') {
    if (responseFormat.schema == null) {
      messages.push({
        role: 'system',
        content: 'Return JSON.',
      });
    } else {
      messages.push({
        role: 'system',
        content:
          'Return JSON that conforms to the following schema: ' +
          JSON.stringify(responseFormat.schema),
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
  for (const { role, content } of prompt) {
    index++;

    switch (role) {
      case 'system': {
        messages.push({ role: 'system', content });
        break;
      }

      case 'user': {
        let userContent = '';
        for (const part of content) {
          if (part.type === 'text') {
            userContent += part.text;
          } else {
            warnings.push({
              type: 'other',
              message: `Unsupported user message part type: ${part.type}`,
            });
          }
        }

        messages.push({
          role: 'user',
          content: userContent,
        });

        break;
      }
      case 'assistant': {
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
              if (index <= lastUserMessageIndex) {
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

        messages.push({
          role: 'assistant',
          content: text,
          reasoning_content: reasoning,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
        for (const toolResponse of content) {
          const output = toolResponse.output;

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
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: contentValue,
          });
        }
        break;
      }

      default: {
        warnings.push({
          type: 'other',
          message: `Unsupported message role: ${role}`,
        });
        break;
      }
    }
  }

  return { messages, warnings };
}
