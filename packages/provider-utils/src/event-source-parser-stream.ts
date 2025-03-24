import { ZodSchema } from 'zod';
import { safeParseJSON, ParseResult } from './parse-json';

export function createEventSourceParserStream<T>({
  schema,
}: {
  schema: ZodSchema<T>;
}) {
  let buffer = '';

  return new TransformStream<string, ParseResult<T>>({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines(buffer, chunk);

      buffer = incompleteLine;

      for (const line of lines) {
        if (line.startsWith('data:')) {
          const text = line.slice(5).trim();

          if (text === '' || text === '[DONE]') {
            continue;
          }

          controller.enqueue(safeParseJSON({ text, schema }));
        }
      }
    },
  });
}

function splitLines(buffer: string, chunk: string) {
  const lines: Array<string> = [];
  let currentLine = buffer;

  for (let i = 0; i < chunk.length; ) {
    const char = chunk[i++];

    // According to the spec, a line is terminated by either:
    // - U+000D CARRIAGE RETURN U+000A LINE FEED (CRLF) character pair
    // - a single U+000A LINE FEED(LF) character not preceded by a U+000D CARRIAGE RETURN(CR) character
    // - a single U+000D CARRIAGE RETURN(CR) character not followed by a U+000A LINE FEED(LF) character
    if (char === '\n') {
      // Standalone LF
      lines.push(currentLine);
      currentLine = '';
    } else if (char === '\r') {
      lines.push(currentLine);
      currentLine = '';

      if (chunk[i + 1] === '\n') {
        i++; // CRLF case: Skip the LF character
      }
    } else {
      currentLine += char;
    }
  }

  return { lines, incompleteLine: currentLine };
}
