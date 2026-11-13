/**
 * Incremental parser of a server-sent event stream that returns the data of
 * each complete event.
 */
export type FxSseParser = {
  /**
   * Adds decoded text and returns the data of the events it completed, in
   * stream order.
   */
  push(text: string): string[];

  /**
   * Returns the data of the last event when the stream ended without the
   * blank line that terminates it.
   */
  flush(): string[];
};

/**
 * Creates a parser for one server-sent event stream. Events end at a blank
 * line; the `data:` lines of an event are joined with newlines, and other
 * lines (fields such as `event:`, comments, or stray text) are ignored.
 * Events without data produce nothing.
 */
export function createFxSseParser(): FxSseParser {
  let buffer = '';
  let data: string[] = [];

  const takeLine = (line: string): string[] => {
    const trimmed = line.endsWith('\r') ? line.slice(0, -1) : line;
    if (trimmed === '') {
      if (data.length === 0) return [];
      const event = data.join('\n');
      data = [];
      return [event];
    }
    if (trimmed.startsWith('data:')) {
      const value = trimmed.slice(5);
      data.push(value.startsWith(' ') ? value.slice(1) : value);
    }
    return [];
  };

  return {
    push(text) {
      buffer += text;
      const events: string[] = [];
      for (;;) {
        const newline = buffer.indexOf('\n');
        if (newline === -1) break;
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        events.push(...takeLine(line));
      }
      return events;
    },
    flush() {
      const events = buffer === '' ? [] : takeLine(buffer);
      buffer = '';
      return [...events, ...takeLine('')];
    },
  };
}
