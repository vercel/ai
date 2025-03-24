export function createEventSourceParserStream() {
  let buffer = '';

  return new TransformStream<string, { data: string }>({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines(buffer, chunk);

      buffer = incompleteLine;

      // using for loop for performance
      for (let i = 0; i < lines.length; ) {
        parseLine(lines[i++], controller);
      }
    },
  });
}

// only support the 'data:' event for now
function parseLine(
  line: string,
  controller: TransformStreamDefaultController<{ data: string }>,
) {
  if (line.startsWith('data:')) {
    const text = line.slice(5).trim();

    if (text !== '') {
      controller.enqueue({ data: text });
    }
  }
}

function splitLines(buffer: string, chunk: string) {
  const lines: Array<string> = [];
  let currentLine = buffer;

  // using for loop for performance
  for (let i = 0; i < chunk.length; ) {
    const char = chunk[i++];

    // According to the spec, a line is terminated by either:
    // - U+000D CARRIAGE RETURN U+000A LINE FEED (CRLF) character pair
    // - a single U+000A LINE FEED(LF) character not preceded by a U+000D CARRIAGE RETURN(CR) character
    // - a single U+000D CARRIAGE RETURN(CR) character not followed by a U+000A LINE FEED(LF) character
    //
    // order is performance-optimized
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
