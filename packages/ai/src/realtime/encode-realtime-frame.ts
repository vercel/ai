/** Private Live continuous wire budgets; legacy transports do not enforce them. */
export const REALTIME_MAX_FRAME_BYTES = 128 * 1024;
export const REALTIME_MAX_BUFFERED_BYTES = 128 * 1024;

export type EncodedRealtimeFrame = {
  data: string | ArrayBuffer | ArrayBufferView | Blob;
  byteLength: number;
};

/** Serialize once, measuring the exact payload passed to the browser. */
export function encodeRealtimeFrame(value: unknown): EncodedRealtimeFrame {
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value))
    return { data: value, byteLength: value.byteLength };
  if (value instanceof Blob) return { data: value, byteLength: value.size };
  const data = typeof value === 'string' ? value : JSON.stringify(value);
  if (data === undefined)
    throw new Error('Realtime event could not be encoded as JSON');
  return { data, byteLength: new TextEncoder().encode(data).byteLength };
}

export function assertRealtimeFrameBudget(
  frame: EncodedRealtimeFrame,
  bufferedAmount: number,
): void {
  if (frame.byteLength > REALTIME_MAX_FRAME_BYTES)
    throw new Error(
      `Realtime frame exceeds the ${REALTIME_MAX_FRAME_BYTES}-byte limit; reduce the event payload`,
    );
  if (bufferedAmount + frame.byteLength > REALTIME_MAX_BUFFERED_BYTES)
    throw new Error(
      `Realtime send buffer is full (${REALTIME_MAX_BUFFERED_BYTES}-byte limit); wait before retrying`,
    );
}
