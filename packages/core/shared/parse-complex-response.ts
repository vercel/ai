import { readDataStream } from './read-data-stream';
import type { FunctionCall, JSONValue, Message, ToolCall } from './types';
import { nanoid } from './utils';

type PrefixMap = {
  text?: Message;
  function_call?: Message & {
    role: 'assistant';
    function_call: FunctionCall;
  };
  tool_calls?: Message & {
    role: 'assistant';
    tool_calls: ToolCall[];
  };
  data: JSONValue[];
};

function assignAnnotationsToMessage<T extends Message | null | undefined>(
  message: T,
  annotations: JSONValue[] | undefined,
): T {
  if (!(message && annotations && annotations.length)) return message;
  return { ...message, annotations: [...annotations] } as T;
}

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
  const prefixMap: PrefixMap = {
    data: [],
  };

  // keep list of current message annotations for message
  let message_annotations: JSONValue[] | undefined = undefined;

  // we create a map of each prefix, and for each prefixed message we push to the map
  for await (const { type, value } of readDataStream(reader, {
    isAborted: () => abortControllerRef?.current === null,
  })) {
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

    let functionCallMessage: Message | null | undefined = null;

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

    let toolCallMessage: Message | null | undefined = null;

    if (type === 'tool_calls') {
      prefixMap['tool_calls'] = {
        id: generateId(),
        role: 'assistant',
        content: '',
        tool_calls: value.tool_calls,
        createdAt,
      };

      toolCallMessage = prefixMap['tool_calls'];
    }

    if (type === 'data') {
      prefixMap['data'].push(...value);
    }

    let responseMessage = prefixMap['text'];

    if (type === 'message_annotations') {
      if (!message_annotations) {
        message_annotations = [...value];
      } else {
        message_annotations.push(...value);
      }

      // Update any existing message with the latest annotations
      functionCallMessage = assignAnnotationsToMessage(
        prefixMap['function_call'],
        message_annotations,
      );
      toolCallMessage = assignAnnotationsToMessage(
        prefixMap['tool_calls'],
        message_annotations,
      );
      responseMessage = assignAnnotationsToMessage(
        prefixMap['text'],
        message_annotations,
      );
    }

    // keeps the prefixMap up to date with the latest annotations, even if annotations preceded the message
    if (message_annotations?.length) {
      const messagePrefixKeys: (keyof PrefixMap)[] = [
        'text',
        'function_call',
        'tool_calls',
      ];
      messagePrefixKeys.forEach(key => {
        if (prefixMap[key]) {
          (prefixMap[key] as Message).annotations = [...message_annotations!];
        }
      });
    }

    // We add function & tool calls and response messages to the messages[], but data is its own thing
    const merged = [functionCallMessage, toolCallMessage, responseMessage]
      .filter(Boolean)
      .map(message => ({
        ...assignAnnotationsToMessage(message, message_annotations),
      })) as Message[];

    update(merged, [...prefixMap['data']]); // make a copy of the data array
  }

  onFinish?.(prefixMap);

  return {
    messages: [
      prefixMap.text,
      prefixMap.function_call,
      prefixMap.tool_calls,
    ].filter(Boolean) as Message[],
    data: prefixMap.data,
  };
}
