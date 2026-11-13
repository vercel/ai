import {
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateTail,
  type TruncationResult,
} from '@earendil-works/pi-coding-agent';
import type { HarnessToolModelOutputContent } from '@ai-sdk/harness/utils';

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

function getPiToolOutputHeadTruncation({
  text,
  continuation,
}: {
  text: string;
  continuation: string;
}): { retainedText: string; notice?: string } {
  const truncation = truncateHead(text);
  if (!truncation.truncated) return { retainedText: text };

  if (truncation.firstLineExceedsLimit) {
    const content = truncateUtf8Start(text, DEFAULT_MAX_BYTES);
    return {
      retainedText: content,
      notice: `Output truncated: showing the first ${formatSize(
        Buffer.byteLength(content, 'utf8'),
      )} of a ${formatSize(truncation.totalBytes)} line. ${continuation}`,
    };
  }

  return {
    retainedText: truncation.content,
    notice: formatHeadNotice(truncation, continuation),
  };
}

export function truncatePiToolOutputHead(
  text: string,
  continuation: string,
): string {
  const { retainedText, notice } = getPiToolOutputHeadTruncation({
    text,
    continuation,
  });
  return notice == null
    ? retainedText
    : joinContentAndNotice(retainedText, notice);
}

export function truncatePiToolModelOutput({
  content,
  continuation,
}: {
  content: ReadonlyArray<HarnessToolModelOutputContent>;
  continuation: string;
}): ReadonlyArray<HarnessToolModelOutputContent> {
  const text = content
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n');
  const { retainedText, notice } = getPiToolOutputHeadTruncation({
    text,
    continuation,
  });
  if (notice == null) return content;

  const truncated: HarnessToolModelOutputContent[] = [];
  let offset = 0;
  let lastTextPart:
    | Extract<HarnessToolModelOutputContent, { type: 'text' }>
    | undefined;
  for (const part of content) {
    if (part.type === 'image') {
      truncated.push(part);
      continue;
    }
    const prefix = retainedText.slice(offset, offset + part.text.length);
    offset += part.text.length + 1;
    if (prefix.length > 0) {
      lastTextPart = { ...part, text: prefix };
      truncated.push(lastTextPart);
    }
  }
  if (lastTextPart != null) {
    lastTextPart.text = joinContentAndNotice(lastTextPart.text, notice);
  } else {
    truncated.splice(
      content.findIndex(part => part.type === 'text'),
      0,
      {
        type: 'text',
        text: joinContentAndNotice('', notice),
      },
    );
  }
  return truncated;
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
