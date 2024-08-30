import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { StreamString } from '../stream-parts';

export function createDataProtocolStream(
  dataPartTexts: StreamString[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return convertArrayToReadableStream(
    dataPartTexts.map(part => encoder.encode(part)),
  );
}
