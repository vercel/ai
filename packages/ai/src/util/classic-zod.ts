import {
  array,
  boolean,
  custom,
  discriminatedUnion,
  instanceof as instanceOf,
  lazy,
  literal,
  null as nullType,
  number,
  object,
  record,
  string,
  union,
  unknown,
} from 'zod/v4';

// Public message schemas retain classic Zod factories and fluent methods.
// Keep their dependencies classic as well, including nested schema fields.
export const z = {
  array,
  boolean,
  custom,
  discriminatedUnion,
  instanceof: instanceOf,
  lazy,
  literal,
  null: nullType,
  number,
  object,
  record,
  string,
  union,
  unknown,
};

export type { ZodType } from 'zod/v4';
