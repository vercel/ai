import type { JSONValue } from '@ai-sdk/provider';
import { InferSchema, Schema } from '@ai-sdk/provider-utils';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4';
import { generateObject } from '../generate-object';

export function wrapGenerateObject<
  EXTRA_OPTIONS extends Record<string, unknown> = Record<string, never>,
  SCHEMA extends z3.Schema | z4.ZodType | Schema = z4.ZodType<JSONValue>,
  OUTPUT extends
    | 'object'
    | 'array'
    | 'enum'
    | 'no-schema' = InferSchema<SCHEMA> extends string ? 'enum' : 'object',
  RESULT = OUTPUT extends 'array'
    ? Array<InferSchema<SCHEMA>>
    : InferSchema<SCHEMA>,
>({
  middleware,
}: {
  middleware: ({
    options,
    doGenerateObject,
  }: {
    options: Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0] &
      EXTRA_OPTIONS;
    doGenerateObject: (
      options: Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0],
    ) => ReturnType<typeof generateObject<SCHEMA, OUTPUT, RESULT>>;
  }) => ReturnType<typeof generateObject<SCHEMA, OUTPUT, RESULT>>;
}) {
  return (
    options: Parameters<typeof generateObject<SCHEMA, OUTPUT, RESULT>>[0] &
      EXTRA_OPTIONS,
  ): ReturnType<typeof generateObject<SCHEMA, OUTPUT, RESULT>> => {
    return middleware({ options, doGenerateObject: generateObject });
  };
}
