const USER_SOURCE_FILENAME = 'run.js';

/** Number of generated lines before the first line of user source. */
export const USER_SOURCE_LINE_OFFSET = 2;

/**
 * Converts a QuickJS stack into a stable stack whose coordinates refer to the
 * source passed to `run`. Frames belonging to the generated wrapper and guest
 * runtime are intentionally omitted.
 */
export function normalizeUserSourceStack({
  name,
  message,
  stack,
  source,
}: {
  name: string;
  message: string;
  stack: string | undefined;
  source: string;
}): string {
  const header = `${name}: ${message}`;
  if (stack === undefined || stack.length === 0) return header;

  const sourceLineCount = source.split('\n').length;
  const lines = stack.split('\n');
  const frames: string[] = [];

  for (const line of lines) {
    if (line.length === 0 || isErrorHeader(line, name, message)) continue;
    if (line.includes('run-setup.js:')) continue;

    let hasGeneratedSourceFrame = false;
    let outsideUserSource = false;
    const normalized = line.replace(
      /run\.js:(\d+):(\d+)/gu,
      (_match, generatedLineText: string, column: string) => {
        hasGeneratedSourceFrame = true;
        const generatedLine = Number(generatedLineText);
        const userLine = generatedLine - USER_SOURCE_LINE_OFFSET;
        if (userLine < 1 || userLine > sourceLineCount) {
          outsideUserSource = true;
          return _match;
        }
        return `${USER_SOURCE_FILENAME}:${userLine}:${column}`;
      },
    );

    if (hasGeneratedSourceFrame && outsideUserSource) continue;
    frames.push(normalized);
  }

  return [header, ...frames].join('\n');
}

function isErrorHeader(line: string, name: string, message: string): boolean {
  return line === name || line === message || line === `${name}: ${message}`;
}
