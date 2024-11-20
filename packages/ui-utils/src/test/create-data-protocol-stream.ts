import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { DataStreamString } from '../data-stream-parts';

export function createDataProtocolStream(
  dataPartTexts: DataStreamString[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return convertArrayToReadableStream(
    dataPartTexts.map(part => encoder.encode(part)),
  );
}
