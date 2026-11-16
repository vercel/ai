/**
 * Returns whether a byte can only continue a UTF-8 encoded character.
 */
function isContinuationByte(byte: number | undefined): boolean {
  return byte !== undefined && (byte & 0b1100_0000) === 0b1000_0000;
}

/**
 * Returns the end of a byte sequence before its last UTF-8 character when
 * that character is cut, so that the remaining bytes decode on their own.
 */
function toUtf8BoundaryEnd(options: {
  /**
   * Bytes to cut.
   */
  bytes: Uint8Array;

  /**
   * End of the part to keep.
   */
  end: number;
}): number {
  const { bytes, end } = options;
  let start = end;
  let continuations = 0;
  while (
    start > 0 &&
    continuations < 3 &&
    isContinuationByte(bytes[start - 1])
  ) {
    start--;
    continuations++;
  }
  if (start === 0) return end;
  const lead = bytes[start - 1];
  const length =
    lead < 0x80
      ? 1
      : lead >= 0xc0 && lead <= 0xdf
        ? 2
        : lead >= 0xe0 && lead <= 0xef
          ? 3
          : lead >= 0xf0 && lead <= 0xf7
            ? 4
            : 1;
  return start - 1 + length <= end ? end : start - 1;
}

/**
 * Collector for sandbox output that keeps host memory bounded, whatever a
 * command writes: it keeps the first `headBytes` and the last `tailBytes` of
 * the output, and drops the bytes between them.
 */
export type FxOutputCapture = {
  /**
   * Adds one chunk of output.
   */
  add: (chunk: Uint8Array) => void;

  /**
   * Output bytes received so far, including dropped bytes.
   */
  readonly totalBytes: number;

  /**
   * Whether every output byte is kept.
   */
  readonly complete: boolean;

  /**
   * Returns the kept bytes, cut before a trailing and after a leading UTF-8
   * continuation byte when bytes were dropped, so that they decode like the
   * output they come from.
   */
  toBytes: () => Uint8Array;
};

/**
 * Creates the bounded collector for sandbox output described by
 * `FxOutputCapture`.
 */
export function createFxOutputCapture(options: {
  /**
   * Maximum bytes kept from the start of the output.
   */
  headBytes: number;

  /**
   * Maximum bytes kept from the end of the output.
   */
  tailBytes: number;
}): FxOutputCapture {
  const { headBytes, tailBytes } = options;
  const head: Uint8Array[] = [];
  const tail: Uint8Array[] = [];
  let headLength = 0;
  let tailLength = 0;
  let totalBytes = 0;
  let droppedBytes = 0;

  return {
    add(chunk) {
      if (chunk.length === 0) return;
      totalBytes += chunk.length;
      /*
       * A chunk can be a view of a larger allocation, and keeping it would
       * keep that whole allocation, so kept bytes are copied out of a view.
       * A chunk that is its own allocation is kept as it is.
       */
      let rest =
        chunk.byteOffset === 0 && chunk.byteLength === chunk.buffer.byteLength
          ? chunk
          : new Uint8Array(chunk);
      if (headLength < headBytes) {
        /*
         * A partially kept chunk is copied for the same reason: a large
         * chunk must not stay alive for the few bytes of it that are kept.
         */
        const take = Math.min(headBytes - headLength, rest.length);
        head.push(
          take === rest.length ? rest : new Uint8Array(rest.subarray(0, take)),
        );
        headLength += take;
        rest = rest.subarray(take);
        if (rest.length === 0) return;
      }
      if (rest.byteOffset !== 0 || rest.byteLength !== rest.buffer.byteLength) {
        rest = new Uint8Array(rest);
      }
      tail.push(rest);
      tailLength += rest.length;
      while (tailLength > tailBytes) {
        const first = tail[0];
        const excess = tailLength - tailBytes;
        if (first.length <= excess) {
          tail.shift();
          tailLength -= first.length;
          droppedBytes += first.length;
          continue;
        }
        /*
         * The kept part of a partially dropped chunk is copied for the same
         * reason as the head: a large chunk must not stay alive for it.
         */
        tail[0] = new Uint8Array(first.subarray(excess));
        tailLength -= excess;
        droppedBytes += excess;
      }
    },
    get totalBytes() {
      return totalBytes;
    },
    get complete() {
      return droppedBytes === 0;
    },
    toBytes() {
      const kept = Buffer.concat([...head, ...tail]);
      if (droppedBytes === 0) return kept;
      const headEnd = toUtf8BoundaryEnd({ bytes: kept, end: headLength });
      let tailStart = headLength;
      while (tailStart < kept.length && isContinuationByte(kept[tailStart])) {
        tailStart++;
      }
      return Buffer.concat([
        kept.subarray(0, headEnd),
        kept.subarray(tailStart),
      ]);
    },
  };
}

/**
 * Reads a sandbox byte stream to its end, passing each chunk to `onChunk`.
 * The reader is cancelled when `abortSignal` aborts and in the `finally`
 * block, so the read ends even when a sandbox leaves the stream open after
 * it stopped the command, e.g. while a child process still holds the pipe.
 */
export async function readFxChunks(options: {
  /**
   * Stream to read.
   */
  stream: ReadableStream<Uint8Array>;

  /**
   * Receives each chunk.
   */
  onChunk: (chunk: Uint8Array) => void;

  /**
   * Aborts the read, resolving it as if the stream had ended.
   */
  abortSignal?: AbortSignal;
}): Promise<void> {
  const { stream, onChunk, abortSignal } = options;
  const reader = stream.getReader();
  const onAbort = () => {
    void reader.cancel().catch(() => {});
  };
  abortSignal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.length > 0) onChunk(value);
    }
  } finally {
    abortSignal?.removeEventListener('abort', onAbort);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
