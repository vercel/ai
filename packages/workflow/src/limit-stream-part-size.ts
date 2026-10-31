import type { ToolSet } from 'ai';
import type { ModelCallStreamPart } from './model-call.js';

/**
 * Largest serialized stream part WorkflowAgent writes to the writable.
 *
 * Durable Workflow streams reject oversized chunks (Vercel Workflow rejects
 * chunks over 10 MiB), which fails the whole step. The limit stays below
 * that to leave room for framing and encryption overhead.
 */
export const MAX_STREAM_PART_BYTES = 8 * 1024 * 1024;

/**
 * Replaces an oversized payload in the stream copy of a part. Step results
 * and the conversation history keep the full value.
 */
export const OMITTED_STREAM_PAYLOAD = {
  type: 'omitted',
  reason: 'too_large_for_stream',
} as const;

// Deltas are small by construction, so they skip the size check.
const UNCHECKED_PART_TYPES = new Set([
  'text-delta',
  'reasoning-delta',
  'tool-input-delta',
]);

// Payload fields to omit, in order, until a part fits.
const OMITTABLE_FIELDS: Record<string, string[]> = {
  'tool-call': ['input'],
  'tool-result': ['output', 'input'],
  'tool-error': ['error', 'input'],
};

/**
 * Fits a stream part under the writable size limit.
 *
 * Oversized tool payloads are replaced with {@link OMITTED_STREAM_PAYLOAD}.
 * Other oversized parts return `undefined` and should not be written.
 */
export function limitStreamPartSize<TTools extends ToolSet>(
  part: ModelCallStreamPart<TTools>,
  maxBytes = MAX_STREAM_PART_BYTES,
): ModelCallStreamPart<TTools> | undefined {
  if (UNCHECKED_PART_TYPES.has(part.type) || !exceedsBytes(part, maxBytes)) {
    return part;
  }

  let limited: Record<string, unknown> = part;
  for (const field of OMITTABLE_FIELDS[part.type] ?? []) {
    limited = { ...limited, [field]: OMITTED_STREAM_PAYLOAD };
    if (!exceedsBytes(limited, maxBytes)) {
      warnOmitted(part, `its "${field}" was omitted`);
      return limited as ModelCallStreamPart<TTools>;
    }
  }

  warnOmitted(part, 'it was not written');
  return undefined;
}

/**
 * Writes a stream part after fitting it under the writable size limit.
 */
export async function writeStreamPart<TTools extends ToolSet>(
  writer: WritableStreamDefaultWriter<ModelCallStreamPart<TTools>>,
  part: ModelCallStreamPart<TTools>,
): Promise<void> {
  const limited = limitStreamPartSize(part);
  if (limited != null) {
    await writer.write(limited);
  }
}

function warnOmitted(part: { type: string }, outcome: string) {
  const toolCallId = (part as { toolCallId?: unknown }).toolCallId;
  console.warn(
    `[WorkflowAgent] A "${part.type}" stream part` +
      (typeof toolCallId === 'string' ? ` (${toolCallId})` : '') +
      ` exceeds the ${MAX_STREAM_PART_BYTES}-byte stream limit, so ${outcome}. ` +
      `Step results and the conversation history keep the full value.`,
  );
}

/**
 * Estimates the serialized size of a value and stops early once it exceeds
 * `maxBytes`. Binary data counts at its base64 size.
 */
function exceedsBytes(value: unknown, maxBytes: number): boolean {
  let bytes = 0;
  const seen = new Set<object>();
  const stack: unknown[] = [value];

  while (stack.length > 0) {
    const current = stack.pop();

    if (typeof current === 'string') {
      bytes += utf8ByteLength(current) + 2;
    } else if (
      current instanceof Uint8Array ||
      current instanceof ArrayBuffer
    ) {
      bytes += Math.ceil(current.byteLength / 3) * 4;
    } else if (typeof current === 'object' && current !== null) {
      if (seen.has(current)) continue;
      seen.add(current);
      for (const [key, child] of Object.entries(current)) {
        bytes += key.length + 4;
        stack.push(child);
      }
    } else {
      bytes += 8;
    }

    if (bytes > maxBytes) return true;
  }

  return false;
}

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair encodes one 4-byte code point.
      bytes += 4;
      i++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}
