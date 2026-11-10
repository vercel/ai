import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import {
  jsonDecodeSerializableValue,
  jsonEncodeSerializableValue,
  parseJSON,
} from '@ai-sdk/provider-utils';
import type { World } from '@workflow/world';
import type {
  HarnessAgentStreamPartRecord,
  HarnessAgentStreamRecord,
  HarnessAgentStreamPart,
  HarnessAgentStreamWriter,
} from './types';

const STREAM_RECORD_VERSION = 1;

/**
 * Encodes one stream record as a JSON text line followed by a newline. The part is
 * encoded immediately, so later mutations by the caller cannot change what
 * is written; encoding errors propagate to the caller.
 */
function encodeRecord(options: {
  /**
   * Record to encode.
   */
  record: HarnessAgentStreamRecord;
}): string {
  const { record } = options;
  if (Object.hasOwn(record, 'withdraw')) {
    return (
      JSON.stringify({
        version: STREAM_RECORD_VERSION,
        withdraw: record.withdraw,
      }) + '\n'
    );
  }
  const encoded: {
    version: number;
    part: JSONValue;
    startId?: string;
    key?: string;
  } = {
    version: STREAM_RECORD_VERSION,
    part: jsonEncodeSerializableValue({
      value: record.part as SerializableValue,
    }),
  };
  if (record.startId != null) encoded.startId = record.startId;
  if (record.key != null) encoded.key = record.key;
  return JSON.stringify(encoded) + '\n';
}

/**
 * Creates the writer for a session's stream, owned by one drive.
 *
 * Records are written to one World stream per session, in strict order: a chunk
 * is sent only after the previous write settled. The first record of an idle
 * burst schedules a send on the next microtask, so records emitted in the same
 * synchronous burst share a chunk, and records emitted while a write is in
 * flight form the next chunk. Every chunk ends with a blank line, giving
 * readers a chunk boundary they can count when resuming.
 *
 * Write failures are ignored, because the stream carries output rather than
 * session state. When the drive's abort signal fires, records not yet sent are
 * discarded and new records are dropped; a write already in flight cannot be
 * recalled.
 */
export function createStreamWriter(options: {
  /**
   * World that stores the session's stream.
   */
  world: World;
  /**
   * World run associated with the session.
   */
  runId: string;
  /**
   * Abort signal of the drive that owns this writer.
   */
  abortSignal: AbortSignal;
}): HarnessAgentStreamWriter {
  const { world, runId, abortSignal } = options;
  const name = runId + '_harness_agent_stream';
  let buffer = '';
  let sending: Promise<void> | undefined;
  let closing: Promise<void> | undefined;

  const discardUnsent = () => {
    buffer = '';
  };
  abortSignal.addEventListener('abort', discardUnsent, { once: true });

  /**
   * Sends buffered records one chunk at a time until the buffer is empty. Only
   * one invocation runs at a time, which keeps exactly one write in flight.
   */
  async function send(): Promise<void> {
    try {
      await Promise.resolve();
      while (buffer.length > 0) {
        const chunk = buffer + '\n';
        buffer = '';
        await Promise.resolve()
          .then(() => world.streams.write(runId, name, chunk))
          .catch(() => {});
      }
    } finally {
      sending = undefined;
    }
  }

  /**
   * Buffers an encoded record, unless the writer was closed or the drive
   * aborted, and starts sending if no send is running.
   */
  function push(record: HarnessAgentStreamRecord): void {
    if (closing != null || abortSignal.aborted) return;
    buffer += encodeRecord({ record });
    sending ??= send();
  }

  /**
   * Waits until no record is buffered and no write is in flight.
   */
  async function flush(): Promise<void> {
    for (let current = sending; current != null; current = sending) {
      await current;
    }
  }

  return {
    emit({ part, startId, key }) {
      const record: HarnessAgentStreamPartRecord = { part };
      if (startId != null) record.startId = startId;
      if (key != null) record.key = key;
      push(record);
    },

    unsafeEmit(part) {
      push({ part });
    },

    withdraw({ startIds }) {
      push({ withdraw: [...startIds] });
    },

    flush,

    close() {
      closing ??= (async () => {
        try {
          await flush();
          await Promise.resolve()
            .then(() => world.streams.close(runId, name))
            .catch(() => {});
        } finally {
          abortSignal.removeEventListener('abort', discardUnsent);
        }
      })();
      return closing;
    },
  };
}

/**
 * Decodes stream text into records, one per line, skipping the blank lines that mark chunk
 * boundaries. Accepts text concatenated from several chunks. Throws on a
 * malformed record or an unsupported version, since skipping a record would make
 * readers misattribute or lose output.
 */
export async function decodeStreamRecords(options: {
  /**
   * Stream text, possibly spanning several chunks.
   */
  text: string;
}): Promise<HarnessAgentStreamRecord[]> {
  const records: HarnessAgentStreamRecord[] = [];
  for (const text of options.text.split('\n')) {
    if (text === '') continue;
    const parsed = await parseJSON({ text });
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('HarnessAgentStream: invalid or unsupported record.');
    }
    const envelope = parsed as Record<string, JSONValue>;
    if (envelope.version !== STREAM_RECORD_VERSION) {
      throw new Error('HarnessAgentStream: invalid or unsupported record.');
    }
    if (Object.hasOwn(envelope, 'withdraw')) {
      const { withdraw } = envelope;
      if (
        !Array.isArray(withdraw) ||
        !withdraw.every(startId => typeof startId === 'string')
      ) {
        throw new Error('HarnessAgentStream: invalid withdraw record.');
      }
      records.push({ withdraw: withdraw as string[] });
      continue;
    }
    const { startId, key } = envelope;
    if (
      !Object.hasOwn(envelope, 'part') ||
      (startId !== undefined && typeof startId !== 'string') ||
      (key !== undefined && typeof key !== 'string')
    ) {
      throw new Error('HarnessAgentStream: invalid part record.');
    }
    const part = jsonDecodeSerializableValue({ value: envelope.part });
    if (
      part == null ||
      typeof part !== 'object' ||
      typeof (part as { type?: unknown }).type !== 'string'
    ) {
      throw new Error('HarnessAgentStream: invalid stream part.');
    }
    const record: HarnessAgentStreamPartRecord = {
      part: part as HarnessAgentStreamPart,
    };
    if (startId !== undefined) record.startId = startId as string;
    if (key !== undefined) record.key = key as string;
    records.push(record);
  }
  return records;
}
