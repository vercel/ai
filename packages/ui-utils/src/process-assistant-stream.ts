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
  onTextPart,
  onErrorPart,
  onAssistantMessagePart,
  onAssistantControlDataPart,
  onDataMessagePart,
}: {
  stream: ReadableStream<Uint8Array>;
  onTextPart?: (
    streamPart: (AssistantStreamPartType & { type: 'text' })['value'],
  ) => Promise<void> | void;
  onErrorPart?: (
    streamPart: (AssistantStreamPartType & { type: 'error' })['value'],
  ) => Promise<void> | void;
  onAssistantMessagePart?: (
    streamPart: (AssistantStreamPartType & {
      type: 'assistant_message';
    })['value'],
  ) => Promise<void> | void;
  onAssistantControlDataPart?: (
    streamPart: (AssistantStreamPartType & {
      type: 'assistant_control_data';
    })['value'],
  ) => Promise<void> | void;
  onDataMessagePart?: (
    streamPart: (AssistantStreamPartType & { type: 'data_message' })['value'],
  ) => Promise<void> | void;
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
      .filter(line => line !== '')
      .map(parseAssistantStreamPart);

    for (const { type, value } of streamParts) {
      switch (type) {
        case 'text':
          await onTextPart?.(value);
          break;
        case 'error':
          await onErrorPart?.(value);
          break;
        case 'assistant_message':
          await onAssistantMessagePart?.(value);
          break;
        case 'assistant_control_data':
          await onAssistantControlDataPart?.(value);
          break;
        case 'data_message':
          await onDataMessagePart?.(value);
          break;
        default: {
          const exhaustiveCheck: never = type;
          throw new Error(`Unknown stream part type: ${exhaustiveCheck}`);
        }
      }
    }
  }
}
