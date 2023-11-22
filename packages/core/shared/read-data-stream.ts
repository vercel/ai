import { StreamPartType, parseStreamPart } from './stream-parts';

export async function* readDataStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  {
    isAborted,
  }: {
    isAborted?: () => boolean;
  } = {},
): AsyncGenerator<StreamPartType> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      if (buffer.length > 0) {
        yield parseStreamPart(buffer);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let endIndex: number;
    while ((endIndex = buffer.indexOf('\n')) !== -1) {
      const line = buffer.substring(0, endIndex).trim();
      yield parseStreamPart(line);
      buffer = buffer.substring(endIndex + 1); // Remove the processed instruction + delimiter
    }

    // The request has been aborted, stop reading the stream.
    if (isAborted?.()) {
      reader.cancel();
      break;
    }
  }
}
