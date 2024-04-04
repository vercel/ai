import {
  LanguageModelV1Prompt,
  UnsupportedFunctionalityError,
  convertUint8ArrayToBase64,
} from '../spec';
import {
  AnthropicMessage,
  AnthropicMessagesPrompt,
} from './anthropic-messages-prompt';

export function convertToAnthropicMessagesPrompt({
  prompt,
  provider,
}: {
  prompt: LanguageModelV1Prompt;
  provider: string;
}): AnthropicMessagesPrompt {
  let system: string | undefined;
  const messages: AnthropicMessage[] = [];

  for (const { role, content } of prompt) {
    switch (role) {
      case 'system': {
        system = content;
        break;
      }

      case 'user': {
        messages.push({
          role: 'user',
          content: content.map(part => {
            switch (part.type) {
              case 'text': {
                return { type: 'text', text: part.text };
              }
              case 'image': {
                if (part.image instanceof URL) {
                  throw new UnsupportedFunctionalityError({
                    provider,
                    functionality: 'URL image parts',
                  });
                } else {
                  return {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: part.mimeType ?? 'image/jpeg',
                      data: convertUint8ArrayToBase64(part.image),
                    },
                  };
                }
              }
            }
          }),
        });
        break;
      }

      case 'assistant': {
        let text = '';
        const toolCalls: string[] = [];

        for (const part of content) {
          switch (part.type) {
            case 'text': {
              text += part.text;
              break;
            }
            case 'tool-call': {
              toolCalls.push(`\
<invoke>
<tool_name>${part.toolName}</tool_name>
<parameters>
${Object.entries(part.args as Record<string, any>)
  .map(([name, value]) => `<${name}>${value}</${name}>`)
  .join('\n')}
</parameters>
</invoke>`);
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
          content:
            text +
            (toolCalls.length > 0
              ? `<function_calls>\n${toolCalls.join('\n')}\n</function_calls>`
              : ''),
        });

        break;
      }
      case 'tool': {
        const results: string[] = [];

        for (const { toolName, result } of content) {
          results.push(`\
<result>
<tool_name>${toolName}</tool_name>
<stdout>${JSON.stringify(result)}</stdout>
</result>`);
        }

        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: `<function_results>\n${results.join(
                '\n',
              )}\n</function_results>`,
            },
          ],
        });

        break;
      }
      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported role: ${_exhaustiveCheck}`);
      }
    }
  }

  return {
    system,
    messages,
  };
}
