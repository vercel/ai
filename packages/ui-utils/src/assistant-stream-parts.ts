import { AssistantMessage, DataMessage, JSONValue } from './types';

export type AssistantStreamString =
  `${(typeof StreamStringPrefixes)[keyof typeof StreamStringPrefixes]}:${string}\n`;

export interface AssistantStreamPart<
  CODE extends string,
  NAME extends string,
  TYPE,
> {
  code: CODE;
  name: NAME;
  parse: (value: JSONValue) => { type: NAME; value: TYPE };
}

const textStreamPart: AssistantStreamPart<'0', 'text', string> = {
  code: '0',
  name: 'text',
  parse: (value: JSONValue) => {
    if (typeof value !== 'string') {
      throw new Error('"text" parts expect a string value.');
    }
    return { type: 'text', value };
  },
};

const errorStreamPart: AssistantStreamPart<'3', 'error', string> = {
  code: '3',
  name: 'error',
  parse: (value: JSONValue) => {
    if (typeof value !== 'string') {
      throw new Error('"error" parts expect a string value.');
    }
    return { type: 'error', value };
  },
};

const assistantMessageStreamPart: AssistantStreamPart<
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

const assistantControlDataStreamPart: AssistantStreamPart<
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

const dataMessageStreamPart: AssistantStreamPart<
  '6',
  'data_message',
  DataMessage
> = {
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

const assistantStreamParts = [
  textStreamPart,
  errorStreamPart,
  assistantMessageStreamPart,
  assistantControlDataStreamPart,
  dataMessageStreamPart,
] as const;

type AssistantStreamParts =
  | typeof textStreamPart
  | typeof errorStreamPart
  | typeof assistantMessageStreamPart
  | typeof assistantControlDataStreamPart
  | typeof dataMessageStreamPart;

type AssistantStreamPartValueType = {
  [P in AssistantStreamParts as P['name']]: ReturnType<P['parse']>['value'];
};

export type AssistantStreamPartType =
  | ReturnType<typeof textStreamPart.parse>
  | ReturnType<typeof errorStreamPart.parse>
  | ReturnType<typeof assistantMessageStreamPart.parse>
  | ReturnType<typeof assistantControlDataStreamPart.parse>
  | ReturnType<typeof dataMessageStreamPart.parse>;

export const assistantStreamPartsByCode = {
  [textStreamPart.code]: textStreamPart,
  [errorStreamPart.code]: errorStreamPart,
  [assistantMessageStreamPart.code]: assistantMessageStreamPart,
  [assistantControlDataStreamPart.code]: assistantControlDataStreamPart,
  [dataMessageStreamPart.code]: dataMessageStreamPart,
} as const;

export const StreamStringPrefixes = {
  [textStreamPart.name]: textStreamPart.code,
  [errorStreamPart.name]: errorStreamPart.code,
  [assistantMessageStreamPart.name]: assistantMessageStreamPart.code,
  [assistantControlDataStreamPart.name]: assistantControlDataStreamPart.code,
  [dataMessageStreamPart.name]: dataMessageStreamPart.code,
} as const;

export const validCodes = assistantStreamParts.map(part => part.code);

export const parseAssistantStreamPart = (
  line: string,
): AssistantStreamPartType => {
  const firstSeparatorIndex = line.indexOf(':');

  if (firstSeparatorIndex === -1) {
    throw new Error('Failed to parse stream string. No separator found.');
  }

  const prefix = line.slice(0, firstSeparatorIndex);

  if (!validCodes.includes(prefix as keyof typeof assistantStreamPartsByCode)) {
    throw new Error(`Failed to parse stream string. Invalid code ${prefix}.`);
  }

  const code = prefix as keyof typeof assistantStreamPartsByCode;

  const textValue = line.slice(firstSeparatorIndex + 1);
  const jsonValue: JSONValue = JSON.parse(textValue);

  return assistantStreamPartsByCode[code].parse(jsonValue);
};

export function formatAssistantStreamPart<
  T extends keyof AssistantStreamPartValueType,
>(type: T, value: AssistantStreamPartValueType[T]): AssistantStreamString {
  const streamPart = assistantStreamParts.find(part => part.name === type);

  if (!streamPart) {
    throw new Error(`Invalid stream part type: ${type}`);
  }

  return `${streamPart.code}:${JSON.stringify(value)}\n`;
}
