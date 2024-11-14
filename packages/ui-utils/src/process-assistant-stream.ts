import {
  AssistantStreamPartType,
  parseAssistantStreamPart,
} from './assistant-stream-parts';

const NEWLINE = '\n'.charCodeAt(0);

// concatenates all the chunks into a single Uint8Array
function concatChunks(chunks: Uint8Array[], totalLength: number) {
  const concatenatedChunks = new Uint8Array(totalLength);

  let offset = 0;
  for (const chunk of chunks) {
    concatenatedChunks.set(chunk, offset);
    offset += chunk.length;
  }
  chunks.length = 0;

  return concatenatedChunks;
}

export async function processAssistantStream({
  stream,
  onStreamPart,
}: {
  stream: ReadableStream<Uint8Array>;
  onStreamPart: (streamPart: AssistantStreamPartType) => Promise<void> | void;
}): Promise<void> {
  // implementation note: this slightly more complex algorithm is required
  // to pass the tests in the edge environment.

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { value } = await reader.read();

    if (value) {
      chunks.push(value);
      totalLength += value.length;
      if (value[value.length - 1] !== NEWLINE) {
        // if the last character is not a newline, we have not read the whole JSON value
        continue;
      }
    }

    if (chunks.length === 0) {
      break; // we have reached the end of the stream
    }

    const concatenatedChunks = concatChunks(chunks, totalLength);
    totalLength = 0;

    const streamParts = decoder
      .decode(concatenatedChunks, { stream: true })
      .split('\n')
      .filter(line => line !== '') // splitting leaves an empty string at the end
      .map(parseAssistantStreamPart);

    for (const streamPart of streamParts) {
      await onStreamPart(streamPart);
    }
  }
}
