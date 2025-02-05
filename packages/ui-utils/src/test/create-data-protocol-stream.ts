import { convertArrayToReadableStream } from '@ai-sdk/provider-utils/test';
import { DataStreamString } from '../data-stream-parts';

export function createDataProtocolStream(
  dataPartTexts: DataStreamString[],
): ReadableStream<Uint8Array> {
  return convertArrayToReadableStream(dataPartTexts).pipeThrough(
    new TextEncoderStream(),
  );
}
