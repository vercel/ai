import { ToolCalls, ToolType } from '@mistralai/mistralai';
import {
  ChatPrompt,
  ImagePart,
  InstructionPrompt,
  TextPart,
  UnsupportedFunctionalityError,
  isInstructionPrompt,
} from '../../core';

type MistralChatMessage = {
  role: string;
  name?: string;
  content: string | string[];
  tool_calls?: Array<ToolCalls>;
};

export function convertToMistralChatPrompt(
  prompt: InstructionPrompt | ChatPrompt,
): Array<MistralChatMessage> {
  return isInstructionPrompt(prompt)
    ? convertInstructionPromptToMistralChatPrompt(prompt)
    : convertChatPromptToMistralChatPrompt(prompt);
}

export function convertInstructionPromptToMistralChatPrompt(
  prompt: InstructionPrompt,
): Array<MistralChatMessage> {
  if (typeof prompt === 'string') {
    return [user(prompt)];
  }

  if (prompt.system == null) {
    return [user(prompt.instruction)];
  }

  return [system(prompt.system), user(prompt.instruction)];
}

export function convertChatPromptToMistralChatPrompt(
  prompt: ChatPrompt,
): Array<MistralChatMessage> {
  const messages: Array<MistralChatMessage> = [];

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
            tool_calls:
              toolCalls.length > 0
                ? toolCalls.map(({ function: { name, arguments: args } }) => ({
                    id: 'null',
                    type: 'function' as ToolType,
                    function: { name, arguments: args },
                  }))
                : undefined,
          });
        }

        break;
      }
      case 'tool': {
        for (const toolResponse of content) {
          messages.push({
            role: 'tool',
            name: toolResponse.toolName,
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
function system(content: string): MistralChatMessage {
  return { role: 'system', content };
}

function user(
  content: string | Array<TextPart | ImagePart>,
): MistralChatMessage {
  if (typeof content === 'string') {
    return { role: 'user', content };
  }

  const textParts = content.map(part => {
    switch (part.type) {
      case 'text': {
        return { type: 'text', text: part.text };
      }
      case 'image': {
        throw new UnsupportedFunctionalityError({
          provider: 'mistral.chat',
          functionality: 'image-part',
        });
      }
    }
  });

  return { role: 'user', content: textParts.join('') };
}
