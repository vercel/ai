import { JSONValue } from './types';

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

export const parseStreamPart = (line: string) => {
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
