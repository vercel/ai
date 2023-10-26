import type { FunctionCall, Message } from '../shared/types';
import { nanoid, createChunkDecoder } from '../shared/utils';

type PrefixMap = {
  text?: Message;
  function_call?:
    | string
    | Pick<Message, 'function_call' | 'role' | 'content' | 'name'>;
  data?: string[];
};

export async function parseComplexResponse({
  reader,
  abortControllerRef,
  update,
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  abortControllerRef: {
    current: AbortController | null;
  };
  update: (merged: Message[], data: string[] | undefined) => void;
}) {
  const decode = createChunkDecoder(true);
  const createdAt = new Date();
  const prefixMap: PrefixMap = {};
  const NEWLINE = '\n'.charCodeAt(0);
  let chunks: Uint8Array[] = [];
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
      // we have reached the end of the stream
      break;
    }

    // concatenate all the chunks into a single Uint8Array
    let concatenatedChunks = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      concatenatedChunks.set(chunk, offset);
      offset += chunk.length;
    }
    chunks.length = 0;
    totalLength = 0;

    // Update the chat state with the new message tokens.
    const lines = decode(concatenatedChunks);

    if (typeof lines === 'string') {
      throw new Error(
        'Invalid response format. Complex mode was set but the response is a string. This should never happen.',
      );
    }

    // we create a map of each prefix, and for each prefixed message we push to the map
    for (const { type, value } of lines) {
      if (type === 'text') {
        if (prefixMap['text']) {
          prefixMap['text'] = {
            ...prefixMap['text'],
            content: (prefixMap['text'].content || '') + value,
          };
        } else {
          prefixMap['text'] = {
            id: nanoid(),
            role: 'assistant',
            content: value,
            createdAt,
          };
        }
      }

      let functionCallMessage: Message | null = null;

      if (type === 'function_call') {
        prefixMap['function_call'] = value;

        let functionCall = prefixMap['function_call'];
        // Ensure it hasn't been parsed
        if (functionCall && typeof functionCall === 'string') {
          const parsedFunctionCall: FunctionCall = JSON.parse(
            functionCall as string,
          ).function_call;

          functionCallMessage = {
            id: nanoid(),
            role: 'assistant',
            content: '',
            function_call: parsedFunctionCall,
            name: parsedFunctionCall.name,
            createdAt,
          };

          prefixMap['function_call'] = functionCallMessage as any;
        }
      }

      if (type === 'data') {
        const parsedValue = JSON.parse(value);
        if (prefixMap['data']) {
          prefixMap['data'] = [...prefixMap['data'], ...parsedValue];
        } else {
          prefixMap['data'] = parsedValue;
        }
      }

      const data = prefixMap['data'];
      const responseMessage = prefixMap['text'];

      // We add function calls and response messages to the messages[], but data is its own thing
      const merged = [functionCallMessage, responseMessage].filter(
        Boolean,
      ) as Message[];

      update(merged, data);

      // The request has been aborted, stop reading the stream.
      if (abortControllerRef.current === null) {
        reader.cancel();
        break;
      }
    }
  }

  return prefixMap;
}
