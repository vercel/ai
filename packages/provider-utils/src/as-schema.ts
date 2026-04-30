import {
  type FlexibleSchema,
  type Schema,
  jsonSchema,
  schemaSymbol,
} from './schema';
import { zodSchema } from './zod-schema';

function isSchema(value: unknown): value is Schema {
  return (
    typeof value === 'object' &&
    value !== null &&
    schemaSymbol in value &&
    value[schemaSymbol] === true &&
    'jsonSchema' in value &&
    'validate' in value
  );
}

export function asSchema<OBJECT>(
  schema: FlexibleSchema<OBJECT> | undefined,
): Schema<OBJECT> {
  return schema == null
    ? jsonSchema({
        properties: {},
        additionalProperties: false,
      })
    : isSchema(schema)
      ? schema
      : typeof schema === 'function'
        ? schema()
        : zodSchema(schema);
}
