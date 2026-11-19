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
/**
 * Parses a URL and removes the fragment, which is not sent to the server.
 * The parser also normalizes it, e.g. `https://Example.com` becomes
 * `https://example.com/`.
 */
function normalizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return undefined;
  }
}

/**
 * Finds http(s) URLs in text. Punctuation at the end of a match, as in
 * "see https://example.com/docs.", is also tried without it.
 */
function extractUrls(text: string): string[] {
  const urls: string[] = [];

  for (const [match] of text.matchAll(/https?:\/\/[^\s<>"'`]+/gi)) {
    urls.push(match);

    let end = match.length;
    while (end > 0 && '.,;:!?)]}'.includes(match[end - 1])) {
      end--;
    }
    if (end < match.length) {
      urls.push(match.slice(0, end));
    }
  }

  return urls;
}

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

  const requested = normalizeUrl(url);
  if (requested === undefined) {
    return false;
  }

  // Compare whole parsed URLs, not substrings: a substring check would let
  // `https://example.com` match `https://example.com.attacker.org/`.
  for (const text of texts) {
    for (const candidate of extractUrls(text)) {
      if (normalizeUrl(candidate) === requested) {
        return true;
      }
    }
  }

  return false;
}
