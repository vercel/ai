import { StreamPartType, parseStreamPart } from './stream-parts';

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

/**
Converts a ReadableStreamDefaultReader into an async generator that yields
StreamPart objects.

@param reader 
       Reader for the stream to read from.
@param isAborted
       Optional function that returns true if the request has been aborted.
       If the function returns true, the generator will stop reading the stream.
       If the function is not provided, the generator will not stop reading the stream.
 */
export async function* readDataStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  {
    isAborted,
  }: {
    isAborted?: () => boolean;
  } = {},
): AsyncGenerator<StreamPartType> {
  // implementation note: this slightly more complex algorithm is required
  // to pass the tests in the edge environment.

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
      .map(parseStreamPart);

    for (const streamPart of streamParts) {
      yield streamPart;
    }

    // The request has been aborted, stop reading the stream.
    if (isAborted?.()) {
      reader.cancel();
      break;
    }
  }
}
