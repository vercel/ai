import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateTail,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';

type ReadToolOutputOptions = {
  text: string;
  filePath: string;
  offset?: number;
  limit?: number;
};

function joinContentAndNotice(content: string, notice: string): string {
  return content.length > 0 ? `${content}\n\n[${notice}]` : `[${notice}]`;
}

function truncateUtf8Start(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return text;

  let end = maxBytes;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) {
    end--;
  }
  return buffer.subarray(0, end).toString('utf8');
}

function formatHeadNotice(
  truncation: TruncationResult,
  continuation: string,
): string {
  const limit =
    truncation.truncatedBy === 'bytes'
      ? ` (${formatSize(truncation.maxBytes)} limit)`
      : '';
  return `Output truncated: showing the first ${truncation.outputLines} of ${truncation.totalLines} lines${limit}. ${continuation}`;
}

function formatTailNotice(
  truncation: TruncationResult,
  continuation: string,
): string {
  const limit =
    truncation.truncatedBy === 'bytes'
      ? ` (${formatSize(truncation.maxBytes)} limit)`
      : '';
  return `Output truncated: showing the last ${truncation.outputLines} of ${truncation.totalLines} lines${limit}. ${continuation}`;
}

export function truncatePiToolOutputHead(
  text: string,
  continuation: string,
): string {
  const truncation = truncateHead(text);
  if (!truncation.truncated) return text;

  if (truncation.firstLineExceedsLimit) {
    const content = truncateUtf8Start(text, DEFAULT_MAX_BYTES);
    return joinContentAndNotice(
      content,
      `Output truncated: showing the first ${formatSize(
        Buffer.byteLength(content, 'utf8'),
      )} of a ${formatSize(truncation.totalBytes)} line. ${continuation}`,
    );
  }

  return joinContentAndNotice(
    truncation.content,
    formatHeadNotice(truncation, continuation),
  );
}

export function truncatePiToolOutputTail(
  text: string,
  continuation: string,
): string {
  const truncation = truncateTail(text);
  if (!truncation.truncated) return text;

  return joinContentAndNotice(
    truncation.content,
    formatTailNotice(truncation, continuation),
  );
}

export function formatPiReadToolOutput({
  text,
  filePath,
  offset,
  limit,
}: ReadToolOutputOptions): string {
  const allLines = text.split('\n');
  const startLine = offset == null ? 0 : Math.max(0, Math.floor(offset) - 1);
  const startLineDisplay = startLine + 1;

  if (startLine >= allLines.length) {
    throw new Error(
      `Offset ${offset} is beyond end of file (${allLines.length} lines total)`,
    );
  }

  const normalizedLimit =
    limit == null ? undefined : Math.max(1, Math.floor(limit));
  const endLine =
    normalizedLimit == null
      ? allLines.length
      : Math.min(startLine + normalizedLimit, allLines.length);
  const selectedContent = allLines.slice(startLine, endLine).join('\n');
  const truncation = truncateHead(selectedContent);

  if (truncation.firstLineExceedsLimit) {
    const lineSize = formatSize(
      Buffer.byteLength(allLines[startLine] ?? '', 'utf8'),
    );
    return `[Line ${startLineDisplay} is ${lineSize}, exceeds ${formatSize(
      DEFAULT_MAX_BYTES,
    )} limit. Use bash: sed -n '${startLineDisplay}p' ${filePath} | head -c ${DEFAULT_MAX_BYTES}]`;
  }

  if (truncation.truncated) {
    const endLineDisplay =
      startLineDisplay + Math.max(0, truncation.outputLines - 1);
    const nextOffset = endLineDisplay + 1;
    const limitNotice =
      truncation.truncatedBy === 'bytes'
        ? ` (${formatSize(DEFAULT_MAX_BYTES)} limit)`
        : '';
    return joinContentAndNotice(
      truncation.content,
      `Showing lines ${startLineDisplay}-${endLineDisplay} of ${allLines.length}${limitNotice}. Use offset=${nextOffset} to continue.`,
    );
  }

  if (endLine < allLines.length) {
    return joinContentAndNotice(
      truncation.content,
      `${allLines.length - endLine} more lines in file. Use offset=${
        endLine + 1
      } to continue.`,
    );
  }

  return truncation.content;
}
