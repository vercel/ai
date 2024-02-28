import { ChatCompletionMessageParam } from 'openai/resources';
import {
  ChatPrompt,
  ImagePart,
  InstructionPrompt,
  TextPart,
  convertDataContentToBase64String,
  isInstructionPrompt,
} from '../../core';

export function convertToOpenAIChatPrompt(
  prompt: InstructionPrompt | ChatPrompt,
): Array<ChatCompletionMessageParam> {
  return isInstructionPrompt(prompt)
    ? convertInstructionPromptToOpenAIChatPrompt(prompt)
    : convertChatPromptToOpenAIChatPrompt(prompt);
}

export function convertInstructionPromptToOpenAIChatPrompt(
  prompt: InstructionPrompt,
): Array<ChatCompletionMessageParam> {
  if (typeof prompt === 'string') {
    return [user(prompt)];
  }

  if (prompt.system == null) {
    return [user(prompt.instruction)];
  }

  return [system(prompt.system), user(prompt.instruction)];
}

export function convertChatPromptToOpenAIChatPrompt(
  prompt: ChatPrompt,
): Array<ChatCompletionMessageParam> {
  const messages: Array<ChatCompletionMessageParam> = [];

  if (prompt.system != null) {
    messages.push(system(prompt.system));
  }

  for (const { role, content } of prompt.messages) {
    switch (role) {
      case 'user': {
        messages.push(user(content));
        break;
      }
      case 'assistant': {
        if (typeof content === 'string') {
          messages.push({ role: 'assistant', content });
        } else {
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
              case 'tool-call': {
                toolCalls.push({
                  id: part.toolCallId,
                  type: 'function',
                  function: {
                    name: part.toolName,
                    arguments: JSON.stringify(part.args),
                  },
                });
                break;
              }
              default: {
                const _exhaustiveCheck: never = part;
                throw new Error(`Unsupported part: ${_exhaustiveCheck}`);
              }
            }
          }

          messages.push({
            role: 'assistant',
            content: text,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
          });
        }

        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.toolCallId,
            content: JSON.stringify(toolResponse.result),
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

  return messages;
}

/**
 * Creates a system chat message.
 */
function system(content: string): ChatCompletionMessageParam {
  return { role: 'system', content };
}

function user(
  content: string | Array<TextPart | ImagePart>,
  options?: { name?: string },
): ChatCompletionMessageParam {
  return {
    role: 'user',
    content:
      typeof content === 'string'
        ? content
        : content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'image': {
                return {
                  type: 'image_url',
                  image_url: {
                    url: `data:${
                      part.mimeType ?? 'image/jpeg'
                    };base64,${convertDataContentToBase64String(part.image)}`,
                  },
                };
              }
            }
          }),
    name: options?.name,
  };
}
