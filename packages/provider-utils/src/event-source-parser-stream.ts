export type EventSourceChunk = {
  event: string | undefined;
  data: string;
  id?: string;
  retry?: number;
};

export function createEventSourceParserStream() {
  let buffer = '';
  let event: string | undefined = undefined;
  let data: string[] = [];
  let lastEventId: string | undefined = undefined;
  let retry: number | undefined = undefined;

  function parseLine(
    line: string,
    controller: TransformStreamDefaultController<EventSourceChunk>,
  ) {
    // Empty line means dispatch the event
    if (line === '') {
      dispatchEvent(controller);
      return;
    }

    // Comments start with colon
    if (line.startsWith(':')) {
      return;
    }

    // Field parsing
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) {
      // field with no value
      handleField(line, '');
      return;
    }

    const field = line.slice(0, colonIndex);
    // If there's a space after the colon, it should be ignored
    const valueStart = colonIndex + 1;
    const value =
      valueStart < line.length && line[valueStart] === ' '
        ? line.slice(valueStart + 1)
        : line.slice(valueStart);

    handleField(field, value);
  }

  function dispatchEvent(
    controller: TransformStreamDefaultController<EventSourceChunk>,
  ) {
    if (data.length > 0) {
      controller.enqueue({
        event,
        data: data.join('\n'),
        id: lastEventId,
        retry,
      });

      // Reset data but keep lastEventId as per spec
      data = [];
      event = undefined;
      retry = undefined;
    }
  }

  function handleField(field: string, value: string) {
    switch (field) {
      case 'event':
        event = value;
        break;
      case 'data':
        data.push(value);
        break;
      case 'id':
        lastEventId = value;
        break;
      case 'retry':
        const parsedRetry = parseInt(value, 10);
        if (!isNaN(parsedRetry)) {
          retry = parsedRetry;
        }
        break;
    }
  }

  return new TransformStream<string, EventSourceChunk>({
    transform(chunk, controller) {
      const { lines, incompleteLine } = splitLines(buffer, chunk);

      buffer = incompleteLine;

      // using for loop for performance
      for (let i = 0; i < lines.length; i++) {
        parseLine(lines[i], controller);
      }
    },

    flush(controller) {
      parseLine(buffer, controller);
      dispatchEvent(controller);
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
