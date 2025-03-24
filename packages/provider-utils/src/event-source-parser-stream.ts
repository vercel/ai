export function createEventSourceParserStream() {
  let buffer = '';
  let event: string | undefined = undefined;

  return new TransformStream<
    string,
    { event: string | undefined; data: string }
  >({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines(buffer, chunk);

      buffer = incompleteLine;

      // using for loop for performance
      for (let i = 0; i < lines.length; ) {
        const line = lines[i++];

        if (line.startsWith('data:')) {
          const text = line.slice(5).trim();

          if (text !== '') {
            controller.enqueue({ event, data: text });
            event = undefined;
          }
        } else if (line.startsWith('event:')) {
          event = line.slice(6).trim();
        }
      }
    },
  });
}

// performance: send in already scanned buffer separately, do not scan again
function splitLines(buffer: string, chunk: string) {
  const lines: Array<string> = [];
  let currentLine = buffer;

  // using for loop for performance
  for (let i = 0; i < chunk.length; ) {
    const char = chunk[i++];

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
