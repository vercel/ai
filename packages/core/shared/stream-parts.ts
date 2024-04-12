import {
  AssistantMessage,
  DataMessage,
  FunctionCall,
  JSONValue,
  ToolCall,
} from './types';
import { StreamString } from './utils';

export interface StreamPart<CODE extends string, NAME extends string, TYPE> {
  code: CODE;
  name: NAME;
  parse: (value: JSONValue) => { type: NAME; value: TYPE };
}

const textStreamPart: StreamPart<'0', 'text', string> = {
  code: '0',
  name: 'text',
  parse: (value: JSONValue) => {
    if (typeof value !== 'string') {
      throw new Error('"text" parts expect a string value.');
    }
    return { type: 'text', value };
  },
};

const functionCallStreamPart: StreamPart<
  '1',
  'function_call',
  { function_call: FunctionCall }
> = {
  code: '1',
  name: 'function_call',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('function_call' in value) ||
      typeof value.function_call !== 'object' ||
      value.function_call == null ||
      !('name' in value.function_call) ||
      !('arguments' in value.function_call) ||
      typeof value.function_call.name !== 'string' ||
      typeof value.function_call.arguments !== 'string'
    ) {
      throw new Error(
        '"function_call" parts expect an object with a "function_call" property.',
      );
    }

    return {
      type: 'function_call',
      value: value as unknown as { function_call: FunctionCall },
    };
  },
};

const dataStreamPart: StreamPart<'2', 'data', Array<JSONValue>> = {
  code: '2',
  name: 'data',
  parse: (value: JSONValue) => {
    if (!Array.isArray(value)) {
      throw new Error('"data" parts expect an array value.');
    }

    return { type: 'data', value };
  },
};

const errorStreamPart: StreamPart<'3', 'error', string> = {
  code: '3',
  name: 'error',
  parse: (value: JSONValue) => {
    if (typeof value !== 'string') {
      throw new Error('"error" parts expect a string value.');
    }
    return { type: 'error', value };
  },
};

const assistantMessageStreamPart: StreamPart<
  '4',
  'assistant_message',
  AssistantMessage
> = {
  code: '4',
  name: 'assistant_message',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('role' in value) ||
      !('content' in value) ||
      typeof value.id !== 'string' ||
      typeof value.role !== 'string' ||
      value.role !== 'assistant' ||
      !Array.isArray(value.content) ||
      !value.content.every(
        item =>
          item != null &&
          typeof item === 'object' &&
          'type' in item &&
          item.type === 'text' &&
          'text' in item &&
          item.text != null &&
          typeof item.text === 'object' &&
          'value' in item.text &&
          typeof item.text.value === 'string',
      )
    ) {
      throw new Error(
        '"assistant_message" parts expect an object with an "id", "role", and "content" property.',
      );
    }

    return {
      type: 'assistant_message',
      value: value as AssistantMessage,
    };
  },
};

const assistantControlDataStreamPart: StreamPart<
  '5',
  'assistant_control_data',
  {
    threadId: string;
    messageId: string;
  }
> = {
  code: '5',
  name: 'assistant_control_data',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('threadId' in value) ||
      !('messageId' in value) ||
      typeof value.threadId !== 'string' ||
      typeof value.messageId !== 'string'
    ) {
      throw new Error(
        '"assistant_control_data" parts expect an object with a "threadId" and "messageId" property.',
      );
    }

    return {
      type: 'assistant_control_data',
      value: {
        threadId: value.threadId,
        messageId: value.messageId,
      },
    };
  },
};

const dataMessageStreamPart: StreamPart<'6', 'data_message', DataMessage> = {
  code: '6',
  name: 'data_message',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('role' in value) ||
      !('data' in value) ||
      typeof value.role !== 'string' ||
      value.role !== 'data'
    ) {
      throw new Error(
        '"data_message" parts expect an object with a "role" and "data" property.',
      );
    }

    return {
      type: 'data_message',
      value: value as DataMessage,
    };
  },
};

const toolCallStreamPart: StreamPart<
  '7',
  'tool_calls',
  { tool_calls: ToolCall[] }
> = {
  code: '7',
  name: 'tool_calls',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('tool_calls' in value) ||
      typeof value.tool_calls !== 'object' ||
      value.tool_calls == null ||
      !Array.isArray(value.tool_calls) ||
      value.tool_calls.some(
        tc =>
          tc == null ||
          typeof tc !== 'object' ||
          !('id' in tc) ||
          typeof tc.id !== 'string' ||
          !('type' in tc) ||
          typeof tc.type !== 'string' ||
          !('function' in tc) ||
          tc.function == null ||
          typeof tc.function !== 'object' ||
          !('arguments' in tc.function) ||
          typeof tc.function.name !== 'string' ||
          typeof tc.function.arguments !== 'string',
      )
    ) {
      throw new Error(
        '"tool_calls" parts expect an object with a ToolCallPayload.',
      );
    }

    return {
      type: 'tool_calls',
      value: value as unknown as { tool_calls: ToolCall[] },
    };
  },
};

const messageAnnotationsStreamPart: StreamPart<
  '8',
  'message_annotations',
  Array<JSONValue>
> = {
  code: '8',
  name: 'message_annotations',
  parse: (value: JSONValue) => {
    if (!Array.isArray(value)) {
      throw new Error('"message_annotations" parts expect an array value.');
    }

    return { type: 'message_annotations', value };
  },
};

const streamParts = [
  textStreamPart,
  functionCallStreamPart,
  dataStreamPart,
  errorStreamPart,
  assistantMessageStreamPart,
  assistantControlDataStreamPart,
  dataMessageStreamPart,
  toolCallStreamPart,
  messageAnnotationsStreamPart,
] as const;

// union type of all stream parts
type StreamParts =
  | typeof textStreamPart
  | typeof functionCallStreamPart
  | typeof dataStreamPart
  | typeof errorStreamPart
  | typeof assistantMessageStreamPart
  | typeof assistantControlDataStreamPart
  | typeof dataMessageStreamPart
  | typeof toolCallStreamPart
  | typeof messageAnnotationsStreamPart;
/**
 * Maps the type of a stream part to its value type.
 */
type StreamPartValueType = {
  [P in StreamParts as P['name']]: ReturnType<P['parse']>['value'];
};

export type StreamPartType =
  | ReturnType<typeof textStreamPart.parse>
  | ReturnType<typeof functionCallStreamPart.parse>
  | ReturnType<typeof dataStreamPart.parse>
  | ReturnType<typeof errorStreamPart.parse>
  | ReturnType<typeof assistantMessageStreamPart.parse>
  | ReturnType<typeof assistantControlDataStreamPart.parse>
  | ReturnType<typeof dataMessageStreamPart.parse>
  | ReturnType<typeof toolCallStreamPart.parse>
  | ReturnType<typeof messageAnnotationsStreamPart.parse>;

export const streamPartsByCode = {
  [textStreamPart.code]: textStreamPart,
  [functionCallStreamPart.code]: functionCallStreamPart,
  [dataStreamPart.code]: dataStreamPart,
  [errorStreamPart.code]: errorStreamPart,
  [assistantMessageStreamPart.code]: assistantMessageStreamPart,
  [assistantControlDataStreamPart.code]: assistantControlDataStreamPart,
  [dataMessageStreamPart.code]: dataMessageStreamPart,
  [toolCallStreamPart.code]: toolCallStreamPart,
  [messageAnnotationsStreamPart.code]: messageAnnotationsStreamPart,
} as const;

/**
 * The map of prefixes for data in the stream
 *
 * - 0: Text from the LLM response
 * - 1: (OpenAI) function_call responses
 * - 2: custom JSON added by the user using `Data`
 * - 6: (OpenAI) tool_call responses
 *
 * Example:
 * ```
 * 0:Vercel
 * 0:'s
 * 0: AI
 * 0: AI
 * 0: SDK
 * 0: is great
 * 0:!
 * 2: { "someJson": "value" }
 * 1: {"function_call": {"name": "get_current_weather", "arguments": "{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}
 * 6: {"tool_call": {"id": "tool_0", "type": "function", "function": {"name": "get_current_weather", "arguments": "{\\n\\"location\\": \\"Charlottesville, Virginia\\",\\n\\"format\\": \\"celsius\\"\\n}"}}}
 *```
 */
export const StreamStringPrefixes = {
  [textStreamPart.name]: textStreamPart.code,
  [functionCallStreamPart.name]: functionCallStreamPart.code,
  [dataStreamPart.name]: dataStreamPart.code,
  [errorStreamPart.name]: errorStreamPart.code,
  [assistantMessageStreamPart.name]: assistantMessageStreamPart.code,
  [assistantControlDataStreamPart.name]: assistantControlDataStreamPart.code,
  [dataMessageStreamPart.name]: dataMessageStreamPart.code,
  [toolCallStreamPart.name]: toolCallStreamPart.code,
  [messageAnnotationsStreamPart.name]: messageAnnotationsStreamPart.code,
} as const;

export const validCodes = streamParts.map(part => part.code);

/**
Parses a stream part from a string.

@param line The string to parse.
@returns The parsed stream part.
@throws An error if the string cannot be parsed.
 */
export const parseStreamPart = (line: string): StreamPartType => {
  const firstSeparatorIndex = line.indexOf(':');

  if (firstSeparatorIndex === -1) {
    throw new Error('Failed to parse stream string. No separator found.');
  }

  const prefix = line.slice(0, firstSeparatorIndex);

  if (!validCodes.includes(prefix as keyof typeof streamPartsByCode)) {
    throw new Error(`Failed to parse stream string. Invalid code ${prefix}.`);
  }

  const code = prefix as keyof typeof streamPartsByCode;

  const textValue = line.slice(firstSeparatorIndex + 1);
  const jsonValue: JSONValue = JSON.parse(textValue);

  return streamPartsByCode[code].parse(jsonValue);
};

/**
Prepends a string with a prefix from the `StreamChunkPrefixes`, JSON-ifies it,
and appends a new line.

It ensures type-safety for the part type and value.
 */
export function formatStreamPart<T extends keyof StreamPartValueType>(
  type: T,
  value: StreamPartValueType[T],
): StreamString {
  const streamPart = streamParts.find(part => part.name === type);

  if (!streamPart) {
    throw new Error(`Invalid stream part type: ${type}`);
  }

  return `${streamPart.code}:${JSON.stringify(value)}\n`;
}
