import type { ModelMessage, ToolResultPart } from 'ai';

function getToolResultText(part: ToolResultPart): string {
  const output = part.output;
  switch (output.type) {
    case 'text':
    case 'error-text':
      return output.value;
    case 'json':
    case 'error-json':
      return JSON.stringify(output.value);
    case 'content':
      return output.value
        .map(contentPart =>
          contentPart.type === 'text' ? contentPart.text : '',
        )
        .join('\n');
    default:
      return '';
  }
}

/**
 * Collects the text where a fetchable URL may legitimately appear: user
 * messages and tool results. Assistant text is excluded, so the model cannot
 * fetch a URL it made up, e.g. one that encodes private data in its query
 * string.
 *
 * System messages are excluded as well: tools only receive system messages
 * that are part of `messages`, not the top-level `system` or `instructions`
 * prompt, so including them would apply inconsistently.
 */
function getContextText(messages: ModelMessage[]): string {
  const texts: string[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'user': {
        if (typeof message.content === 'string') {
          texts.push(message.content);
        } else {
          for (const part of message.content) {
            if (part.type === 'text') {
              texts.push(part.text);
            }
          }
        }
        break;
      }

      case 'assistant': {
        // Provider-executed tool results, e.g. from a provider web search tool.
        if (typeof message.content !== 'string') {
          for (const part of message.content) {
            if (part.type === 'tool-result') {
              texts.push(getToolResultText(part));
            }
          }
        }
        break;
      }

      case 'tool': {
        for (const part of message.content) {
          if (part.type === 'tool-result') {
            texts.push(getToolResultText(part));
          }
        }
        break;
      }
    }
  }

  return texts.join('\n');
}

export function isUrlInContext({
  url,
  messages,
}: {
  url: string;
  messages: ModelMessage[];
}): boolean {
  const contextText = getContextText(messages);
  const href = new URL(url).href;

  return [url, href, href.replace(/\/$/, '')].some(
    candidate => candidate !== '' && contextText.includes(candidate),
  );
}
