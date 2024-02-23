import { ChatCompletionMessageParam } from 'openai/resources';
import {
  ChatPrompt,
  ImagePart,
  InstructionPrompt,
  LanguageModelPrompt,
  TextPart,
  convertDataContentToBase64String,
  isInstructionPrompt,
  isTextPrompt,
} from '../../function';

export function convertToOpenAIChatPrompt(
  prompt: LanguageModelPrompt,
): Array<ChatCompletionMessageParam> {
  if (isTextPrompt(prompt)) {
    return convertTextPromptToOpenAIChatPrompt(prompt);
  } else if (isInstructionPrompt(prompt)) {
    return convertInstructionPromptToOpenAIChatPrompt(prompt);
  } else {
    return convertChatPromptToOpenAIChatPrompt(prompt);
  }
}

export function convertTextPromptToOpenAIChatPrompt(
  prompt: string,
): Array<ChatCompletionMessageParam> {
  return [user(prompt)];
}

export function convertInstructionPromptToOpenAIChatPrompt(
  prompt: InstructionPrompt,
): Array<ChatCompletionMessageParam> {
  const messages: Array<ChatCompletionMessageParam> = [];

  if (prompt.system != null) {
    messages.push(system(prompt.system));
  }

  messages.push(user(prompt.instruction));

  return messages;
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
          messages.push(assistant(content));
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
                  id: part.id,
                  type: 'function',
                  function: {
                    name: part.name,
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
            tool_calls: toolCalls,
          });
        }

        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          messages.push({
            role: 'tool',
            tool_call_id: toolResponse.id,
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

/**
 * Creates an assistant chat message.
 * The assistant message can optionally contain tool calls
 * or a function call (function calls are deprecated).
 */
function assistant(content: string | null): ChatCompletionMessageParam {
  return {
    role: 'assistant',
    content,
  };
}

/**
 * Creates a tool result chat message with the result of a tool call.
 */
function tool({
  toolCallId,
  content,
}: {
  toolCallId: string;
  content: unknown;
}): ChatCompletionMessageParam {
  return {
    role: 'tool' as const,
    tool_call_id: toolCallId,
    content: JSON.stringify(content),
  };
}
