import type { FunctionCall, JSONValue, Message } from './types';
import { createChunkDecoder, nanoid } from './utils';

type PrefixMap = {
  text?: Message;
  function_call?: Message & {
    role: 'assistant';
    function_call: FunctionCall;
  };
  data: JSONValue[];
};

export async function parseComplexResponse({
  reader,
  abortControllerRef,
  update,
  onFinish,
  generateId = nanoid,
  getCurrentDate = () => new Date(),
}: {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  abortControllerRef?: {
    current: AbortController | null;
  };
  update: (merged: Message[], data: JSONValue[] | undefined) => void;
  onFinish?: (prefixMap: PrefixMap) => void;
  generateId?: () => string;
  getCurrentDate?: () => Date;
}) {
  const createdAt = getCurrentDate();

  const decode = createChunkDecoder(true);
  const prefixMap: PrefixMap = {
    data: [],
  };
  const NEWLINE = '\n'.charCodeAt(0);
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
            id: generateId(),
            role: 'assistant',
            content: value,
            createdAt,
          };
        }
      }

      let functionCallMessage: Message | null = null;

      if (type === 'function_call') {
        prefixMap['function_call'] = {
          id: generateId(),
          role: 'assistant',
          content: '',
          function_call: value.function_call,
          name: value.function_call.name,
          createdAt,
        };

        functionCallMessage = prefixMap['function_call'];
      }

      if (type === 'data') {
        prefixMap['data'].push(...value);
      }

      const responseMessage = prefixMap['text'];

      // We add function calls and response messages to the messages[], but data is its own thing
      const merged = [functionCallMessage, responseMessage].filter(
        Boolean,
      ) as Message[];

      update(merged, [...prefixMap['data']]); // make a copy of the data array

      // The request has been aborted, stop reading the stream.
      // If abortControllerRef is undefined, this is intentionally not executed.
      if (abortControllerRef?.current === null) {
        reader.cancel();
        break;
      }
    }
  }

  onFinish?.(prefixMap);

  return {
    messages: [prefixMap.text, prefixMap.function_call].filter(
      Boolean,
    ) as Message[],
    data: prefixMap.data,
  };
}
