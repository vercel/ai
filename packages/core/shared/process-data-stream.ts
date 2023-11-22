import { StreamPartType, parseStreamPart } from './stream-parts';

export async function processDataStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  processStreamPart: (part: StreamPartType) => void | Promise<void>,
) {
  const decoder = new TextDecoder();
  let buffer = '';

  function processLine(line: string) {
    // TODO error handling
    processStreamPart(parseStreamPart(line));
  }

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      if (buffer.length > 0) {
        processLine(buffer);
      }
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let endIndex: number;
    while ((endIndex = buffer.indexOf('\n')) !== -1) {
      processLine(buffer.substring(0, endIndex).trim());
      buffer = buffer.substring(endIndex + 1); // Remove the processed instruction + delimiter
    }
  }
}
