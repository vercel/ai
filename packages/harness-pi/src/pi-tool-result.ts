import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateTail,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';

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
