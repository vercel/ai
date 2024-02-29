import { ChatCompletionMessageParam } from 'openai/resources';
import { ChatPrompt, convertDataContentToBase64String } from '../../core';

export function convertToOpenAIChatPrompt(
  prompt: ChatPrompt,
): Array<ChatCompletionMessageParam> {
  const messages: Array<ChatCompletionMessageParam> = [];

  if (prompt.system != null) {
    messages.push({ role: 'system', content: prompt.system });
  }

  for (const { role, content } of prompt.messages) {
    switch (role) {
      case 'user': {
        messages.push({
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
                          };base64,${convertDataContentToBase64String(
                            part.image,
                          )}`,
                        },
                      };
                    }
                  }
                }),
        });
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
