import {
  array,
  boolean,
  custom,
  discriminatedUnion,
  enum as enumType,
  instanceof as instanceOf,
  lazy,
  literal,
  looseObject,
  never,
  null as nullType,
  number,
  object,
  record,
  string,
  union,
  unknown,
} from 'zod/v4';

// Import individual Zod factories so bundlers can tree-shake the full `z`
// namespace, which also re-exports every locale.
export const z = {
  array,
  boolean,
  custom,
  discriminatedUnion,
  enum: enumType,
  instanceof: instanceOf,
  lazy,
  literal,
  looseObject,
  never,
  null: nullType,
  number,
  object,
  record,
  string,
  union,
  unknown,
};

export type { ZodType } from 'zod/v4';
