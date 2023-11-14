import { JSONValue } from './types';
import { StreamString } from './utils';

export interface StreamPart<CODE extends string, NAME extends string, TYPE> {
  code: CODE;
  name: NAME;
  parse: (value: JSONValue) => { type: NAME; value: TYPE };
}

export const textStreamPart: StreamPart<'0', 'text', string> = {
  code: '0',
  name: 'text',
  parse: (value: JSONValue) => {
    if (typeof value !== 'string') {
      throw new Error('Expected string');
    }
    return { type: 'text', value };
  },
};

export const functionCallStreamPart: StreamPart<
  '1',
  'function_call',
  JSONValue
> = {
  code: '1',
  name: 'function_call',
  parse: (value: JSONValue) => ({
    type: 'function_call',
    value: value as JSONValue, // TODO should this be FunctionCall?
  }),
};

export const dataStreamPart: StreamPart<'2', 'data', JSONValue> = {
  code: '2',
  name: 'data',
  parse: (value: JSONValue) => ({
    type: 'data',
    value: value as JSONValue,
  }),
};

const streamParts = [
  textStreamPart,
  functionCallStreamPart,
  dataStreamPart,
] as const;

// union type of all stream parts
type StreamParts =
  | typeof textStreamPart
  | typeof functionCallStreamPart
  | typeof dataStreamPart;

/**
 * Maps the type of a stream part to its value type.
 */
type StreamPartValueType = {
  [P in StreamParts as P['name']]: ReturnType<P['parse']>['value'];
};

export type StreamPartType =
  | ReturnType<typeof textStreamPart.parse>
  | ReturnType<typeof functionCallStreamPart.parse>
  | ReturnType<typeof dataStreamPart.parse>;

export const streamPartsByCode = {
  [textStreamPart.code]: textStreamPart,
  [functionCallStreamPart.code]: functionCallStreamPart,
  [dataStreamPart.code]: dataStreamPart,
} as const;

export const validCodes = streamParts.map(part => part.code);

/**
 * Parses a stream part from a string.
 *
 * @param line The string to parse.
 * @returns The parsed stream part.
 * @throws An error if the string cannot be parsed.
 */
export const parseStreamPart = (line: string): StreamPartType => {
  const firstSeperatorIndex = line.indexOf(':');

  if (firstSeperatorIndex === -1) {
    throw new Error('Failed to parse stream string. No seperator found.');
  }

  const prefix = line.slice(0, firstSeperatorIndex);

  if (!validCodes.includes(prefix as keyof typeof streamPartsByCode)) {
    throw new Error(`Failed to parse stream string. Invalid code ${prefix}.`);
  }

  const code = prefix as keyof typeof streamPartsByCode;

  const textValue = line.slice(firstSeperatorIndex + 1);
  const jsonValue: JSONValue = JSON.parse(textValue);

  return streamPartsByCode[code].parse(jsonValue);
};

/**
 * Prepends a string with a prefix from the `StreamChunkPrefixes`, JSON-ifies it,
 * and appends a new line.
 *
 * It ensures type-safety for the part type and value.
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
