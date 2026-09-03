import {
  any,
  array,
  boolean,
  discriminatedUnion,
  enum as enumType,
  literal,
  number,
  object,
  record,
  string,
  union,
  unknown,
} from 'zod/v4';

// Import individual Zod factories so bundlers do not retain the full `z`
// namespace and all of its locale exports.
export const z = {
  any,
  array,
  boolean,
  discriminatedUnion,
  enum: enumType,
  literal,
  number,
  object,
  record,
  string,
  union,
  unknown,
};
