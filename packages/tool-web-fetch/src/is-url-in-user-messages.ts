import type { ModelMessage } from 'ai';

/**
 * Checks whether a URL appears in the text of a user message.
 *
 * Only user messages count. Assistant messages, tool calls, and tool results
 * are excluded because the model controls their content, directly or through
 * tool inputs that are reflected in outputs. Otherwise, a model could make a
 * URL fetchable by first writing it, e.g. a URL that encodes private data in
 * its query string.
 */
export function isUrlInUserMessages({
  url,
  messages,
}: {
  url: string;
  messages: ModelMessage[];
}): boolean {
  const texts: string[] = [];

  for (const message of messages) {
    if (message.role !== 'user') {
      continue;
    }

    if (typeof message.content === 'string') {
      texts.push(message.content);
    } else {
      for (const part of message.content) {
        if (part.type === 'text') {
          texts.push(part.text);
        }
      }
    }
  }

  const userText = texts.join('\n');
  const href = new URL(url).href;

  return [url, href, href.replace(/\/$/, '')].some(candidate =>
    userText.includes(candidate),
  );
}
