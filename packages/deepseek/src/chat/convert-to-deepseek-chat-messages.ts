import {
  LanguageModelV4CallOptions,
  LanguageModelV4Prompt,
  SharedV4Warning,
} from '@ai-sdk/provider';
import { DeepSeekChatPrompt } from './deepseek-chat-api-types';
import { DeepSeekChatModelId } from './deepseek-chat-options';

/**
 * Only `deepseek-reasoner` should receive historical `reasoning_content` in the
 * request body. For `deepseek-chat`, sending prior reasoning wastes tokens and
 * can confuse the non-reasoning model. For `deepseek-reasoner`, only include
 * reasoning on the assistant turn immediately before the latest user message
 * (or any assistant after that user), to avoid DeepSeek API 400s when replaying
 * long chains of thought.
 */
function shouldIncludeAssistantReasoningContent({
  modelId,
  messageIndex,
  lastUserMessageIndex,
  lastAssistantIndexBeforeLastUser,
}: {
  modelId: DeepSeekChatModelId;
  messageIndex: number;
  lastUserMessageIndex: number;
  lastAssistantIndexBeforeLastUser: number;
}): boolean {
  if (modelId !== 'deepseek-reasoner') {
    return false;
  }

  if (lastUserMessageIndex < 0) {
    return true;
  }

  return (
    messageIndex > lastUserMessageIndex ||
    messageIndex === lastAssistantIndexBeforeLastUser
  );
}

export function convertToDeepSeekChatMessages({
  prompt,
  responseFormat,
  modelId,
}: {
  prompt: LanguageModelV4Prompt;
  responseFormat: LanguageModelV4CallOptions['responseFormat'];
  modelId: DeepSeekChatModelId;
}): {
  messages: DeepSeekChatPrompt;
  warnings: Array<SharedV4Warning>;
} {
  const messages: DeepSeekChatPrompt = [];
  const warnings: Array<SharedV4Warning> = [];

  let lastUserMessageIndex = -1;
  for (let i = prompt.length - 1; i >= 0; i--) {
    if (prompt[i].role === 'user') {
      lastUserMessageIndex = i;
      break;
    }
  }

  let lastAssistantIndexBeforeLastUser = -1;
  if (lastUserMessageIndex >= 0) {
    for (let i = lastUserMessageIndex - 1; i >= 0; i--) {
      if (prompt[i].role === 'assistant') {
        lastAssistantIndexBeforeLastUser = i;
        break;
      }
    }
  }

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

  for (let index = 0; index < prompt.length; index++) {
    const { role, content } = prompt[index]!;
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
        let reasoning: string | undefined;

        const toolCalls: Array<{
          id: string;
          type: 'function';
          function: { name: string; arguments: string };
        }> = [];

        const attachReasoning = shouldIncludeAssistantReasoningContent({
          modelId,
          messageIndex: index,
          lastUserMessageIndex,
          lastAssistantIndexBeforeLastUser,
        });

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'reasoning': {
              if (!attachReasoning) {
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
