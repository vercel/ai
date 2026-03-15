import {
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  SharedV3Warning,
} from '@ai-sdk/provider';
import { MiniMaxChatPrompt } from './minimax-chat-api-types';

export function convertToMiniMaxChatMessages({
  prompt,
  responseFormat,
}: {
  prompt: LanguageModelV3Prompt;
  responseFormat: LanguageModelV3CallOptions['responseFormat'];
}): {
  messages: MiniMaxChatPrompt;
  warnings: Array<SharedV3Warning>;
} {
  const messages: MiniMaxChatPrompt = [];
  const warnings: Array<SharedV3Warning> = [];

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
      warnings.push({
        type: 'compatibility',
        feature: 'responseFormat JSON schema',
        details: 'JSON response schema is injected into the system message.',
      });
    }
  }

  for (const { role, content } of prompt) {
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
              type: 'unsupported',
              feature: `user message part type: ${part.type}`,
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
              // MiniMax does not support reasoning content
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
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        break;
      }

      case 'tool': {
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
              contentValue = output.reason ?? 'Tool execution denied.';
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
