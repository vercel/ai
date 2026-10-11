/**
 * Extracts a 1-based inclusive line range from `text`.
 *
 * CRLF, LF, and CR are recognized as logical line endings, including when a
 * file mixes them. Original line endings within the selected range are
 * preserved. When neither `startLine` nor `endLine` is provided, the input is
 * returned unchanged. `endLine` past EOF clamps to the last line.
 */
export function extractLines({
  text,
  startLine,
  endLine,
}: {
  text: string;
  startLine?: number;
  endLine?: number;
}): string {
  if (startLine == null && endLine == null) return text;

  const lines: Array<{ start: number; end: number }> = [];
  let lineStart = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (character !== '\r' && character !== '\n') {
      continue;
    }

    lines.push({ start: lineStart, end: index });

    if (character === '\r' && text[index + 1] === '\n') {
      index++;
    }

    lineStart = index + 1;
  }

  lines.push({ start: lineStart, end: text.length });

  const start = Math.max(1, startLine ?? 1) - 1;
  const end = Math.min(lines.length, endLine ?? lines.length);
  const selectedLines = lines.slice(start, end);

  if (selectedLines.length === 0) {
    return '';
  }

  return text.slice(
    selectedLines[0].start,
    selectedLines[selectedLines.length - 1].end,
  );
}
