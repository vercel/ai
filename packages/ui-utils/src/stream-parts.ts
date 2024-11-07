import { LanguageModelV1FinishReason } from '@ai-sdk/provider';
import {
  ToolCall as CoreToolCall,
  ToolResult as CoreToolResult,
} from '@ai-sdk/provider-utils';
import { AssistantMessage, DataMessage, JSONValue } from './types';

export type StreamString =
  `${(typeof StreamStringPrefixes)[keyof typeof StreamStringPrefixes]}:${string}\n`;

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

const toolCallStreamPart: StreamPart<
  '9',
  'tool_call',
  CoreToolCall<string, any>
> = {
  code: '9',
  name: 'tool_call',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('toolCallId' in value) ||
      typeof value.toolCallId !== 'string' ||
      !('toolName' in value) ||
      typeof value.toolName !== 'string' ||
      !('args' in value) ||
      typeof value.args !== 'object'
    ) {
      throw new Error(
        '"tool_call" parts expect an object with a "toolCallId", "toolName", and "args" property.',
      );
    }

    return {
      type: 'tool_call',
      value: value as unknown as CoreToolCall<string, any>,
    };
  },
};

const toolResultStreamPart: StreamPart<
  'a',
  'tool_result',
  Omit<CoreToolResult<string, any, any>, 'args' | 'toolName'>
> = {
  code: 'a',
  name: 'tool_result',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('toolCallId' in value) ||
      typeof value.toolCallId !== 'string' ||
      !('result' in value)
    ) {
      throw new Error(
        '"tool_result" parts expect an object with a "toolCallId" and a "result" property.',
      );
    }

    return {
      type: 'tool_result',
      value: value as unknown as Omit<
        CoreToolResult<string, any, any>,
        'args' | 'toolName'
      >,
    };
  },
};

const toolCallStreamingStartStreamPart: StreamPart<
  'b',
  'tool_call_streaming_start',
  { toolCallId: string; toolName: string }
> = {
  code: 'b',
  name: 'tool_call_streaming_start',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('toolCallId' in value) ||
      typeof value.toolCallId !== 'string' ||
      !('toolName' in value) ||
      typeof value.toolName !== 'string'
    ) {
      throw new Error(
        '"tool_call_streaming_start" parts expect an object with a "toolCallId" and "toolName" property.',
      );
    }

    return {
      type: 'tool_call_streaming_start',
      value: value as unknown as { toolCallId: string; toolName: string },
    };
  },
};

const toolCallDeltaStreamPart: StreamPart<
  'c',
  'tool_call_delta',
  { toolCallId: string; argsTextDelta: string }
> = {
  code: 'c',
  name: 'tool_call_delta',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('toolCallId' in value) ||
      typeof value.toolCallId !== 'string' ||
      !('argsTextDelta' in value) ||
      typeof value.argsTextDelta !== 'string'
    ) {
      throw new Error(
        '"tool_call_delta" parts expect an object with a "toolCallId" and "argsTextDelta" property.',
      );
    }

    return {
      type: 'tool_call_delta',
      value: value as unknown as {
        toolCallId: string;
        argsTextDelta: string;
      },
    };
  },
};

const finishMessageStreamPart: StreamPart<
  'd',
  'finish_message',
  {
    finishReason: LanguageModelV1FinishReason;
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
  }
> = {
  code: 'd',
  name: 'finish_message',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('finishReason' in value) ||
      typeof value.finishReason !== 'string'
    ) {
      throw new Error(
        '"finish_message" parts expect an object with a "finishReason" property.',
      );
    }

    const result: {
      finishReason: LanguageModelV1FinishReason;
      usage?: {
        promptTokens: number;
        completionTokens: number;
      };
    } = {
      finishReason: value.finishReason as LanguageModelV1FinishReason,
    };

    if (
      'usage' in value &&
      value.usage != null &&
      typeof value.usage === 'object' &&
      'promptTokens' in value.usage &&
      'completionTokens' in value.usage
    ) {
      result.usage = {
        promptTokens:
          typeof value.usage.promptTokens === 'number'
            ? value.usage.promptTokens
            : Number.NaN,
        completionTokens:
          typeof value.usage.completionTokens === 'number'
            ? value.usage.completionTokens
            : Number.NaN,
      };
    }

    return {
      type: 'finish_message',
      value: result,
    };
  },
};

const finishStepStreamPart: StreamPart<
  'e',
  'finish_step',
  {
    isContinued: boolean;
    finishReason: LanguageModelV1FinishReason;
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
  }
> = {
  code: 'e',
  name: 'finish_step',
  parse: (value: JSONValue) => {
    if (
      value == null ||
      typeof value !== 'object' ||
      !('finishReason' in value) ||
      typeof value.finishReason !== 'string'
    ) {
      throw new Error(
        '"finish_step" parts expect an object with a "finishReason" property.',
      );
    }

    const result: {
      isContinued: boolean;
      finishReason: LanguageModelV1FinishReason;
      usage?: {
        promptTokens: number;
        completionTokens: number;
      };
    } = {
      finishReason: value.finishReason as LanguageModelV1FinishReason,
      isContinued: false,
    };

    if (
      'usage' in value &&
      value.usage != null &&
      typeof value.usage === 'object' &&
      'promptTokens' in value.usage &&
      'completionTokens' in value.usage
    ) {
      result.usage = {
        promptTokens:
          typeof value.usage.promptTokens === 'number'
            ? value.usage.promptTokens
            : Number.NaN,
        completionTokens:
          typeof value.usage.completionTokens === 'number'
            ? value.usage.completionTokens
            : Number.NaN,
      };
    }

    if ('isContinued' in value && typeof value.isContinued === 'boolean') {
      result.isContinued = value.isContinued;
    }

    return {
      type: 'finish_step',
      value: result,
    };
  },
};

const streamParts = [
  textStreamPart,
  dataStreamPart,
  errorStreamPart,
  assistantMessageStreamPart,
  assistantControlDataStreamPart,
  dataMessageStreamPart,
  messageAnnotationsStreamPart,
  toolCallStreamPart,
  toolResultStreamPart,
  toolCallStreamingStartStreamPart,
  toolCallDeltaStreamPart,
  finishMessageStreamPart,
  finishStepStreamPart,
] as const;

// union type of all stream parts
type StreamParts =
  | typeof textStreamPart
  | typeof dataStreamPart
  | typeof errorStreamPart
  | typeof assistantMessageStreamPart
  | typeof assistantControlDataStreamPart
  | typeof dataMessageStreamPart
  | typeof messageAnnotationsStreamPart
  | typeof toolCallStreamPart
  | typeof toolResultStreamPart
  | typeof toolCallStreamingStartStreamPart
  | typeof toolCallDeltaStreamPart
  | typeof finishMessageStreamPart
  | typeof finishStepStreamPart;

/**
 * Maps the type of a stream part to its value type.
 */
type StreamPartValueType = {
  [P in StreamParts as P['name']]: ReturnType<P['parse']>['value'];
};

export type StreamPartType =
  | ReturnType<typeof textStreamPart.parse>
  | ReturnType<typeof dataStreamPart.parse>
  | ReturnType<typeof errorStreamPart.parse>
  | ReturnType<typeof assistantMessageStreamPart.parse>
  | ReturnType<typeof assistantControlDataStreamPart.parse>
  | ReturnType<typeof dataMessageStreamPart.parse>
  | ReturnType<typeof messageAnnotationsStreamPart.parse>
  | ReturnType<typeof toolCallStreamPart.parse>
  | ReturnType<typeof toolResultStreamPart.parse>
  | ReturnType<typeof toolCallStreamingStartStreamPart.parse>
  | ReturnType<typeof toolCallDeltaStreamPart.parse>
  | ReturnType<typeof finishMessageStreamPart.parse>
  | ReturnType<typeof finishStepStreamPart.parse>;

export const streamPartsByCode = {
  [textStreamPart.code]: textStreamPart,
  [dataStreamPart.code]: dataStreamPart,
  [errorStreamPart.code]: errorStreamPart,
  [assistantMessageStreamPart.code]: assistantMessageStreamPart,
  [assistantControlDataStreamPart.code]: assistantControlDataStreamPart,
  [dataMessageStreamPart.code]: dataMessageStreamPart,
  [messageAnnotationsStreamPart.code]: messageAnnotationsStreamPart,
  [toolCallStreamPart.code]: toolCallStreamPart,
  [toolResultStreamPart.code]: toolResultStreamPart,
  [toolCallStreamingStartStreamPart.code]: toolCallStreamingStartStreamPart,
  [toolCallDeltaStreamPart.code]: toolCallDeltaStreamPart,
  [finishMessageStreamPart.code]: finishMessageStreamPart,
  [finishStepStreamPart.code]: finishStepStreamPart,
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
  [dataStreamPart.name]: dataStreamPart.code,
  [errorStreamPart.name]: errorStreamPart.code,
  [assistantMessageStreamPart.name]: assistantMessageStreamPart.code,
  [assistantControlDataStreamPart.name]: assistantControlDataStreamPart.code,
  [dataMessageStreamPart.name]: dataMessageStreamPart.code,
  [messageAnnotationsStreamPart.name]: messageAnnotationsStreamPart.code,
  [toolCallStreamPart.name]: toolCallStreamPart.code,
  [toolResultStreamPart.name]: toolResultStreamPart.code,
  [toolCallStreamingStartStreamPart.name]:
    toolCallStreamingStartStreamPart.code,
  [toolCallDeltaStreamPart.name]: toolCallDeltaStreamPart.code,
  [finishMessageStreamPart.name]: finishMessageStreamPart.code,
  [finishStepStreamPart.name]: finishStepStreamPart.code,
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
