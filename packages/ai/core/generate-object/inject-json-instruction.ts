import { JSONSchema7 } from 'json-schema';

const DEFAULT_SCHEMA_PREFIX = 'JSON schema:';
const DEFAULT_SCHEMA_SUFFIX =
  'You MUST answer with a JSON object that matches the JSON schema above.';

// TODO test
export function injectJsonInstruction({
  prompt,
  schema,
  schemaPrefix = schema != null ? DEFAULT_SCHEMA_PREFIX : undefined,
  schemaSuffix = schema != null
    ? DEFAULT_SCHEMA_SUFFIX
    : 'You MUST answer with JSON',
}: {
  prompt?: string;
  schema?: JSONSchema7;
  schemaPrefix?: string;
  schemaSuffix?: string;
}): string {
  return [
    prompt,
    prompt != null ? '' : null, // add a newline if prompt is not null
    schemaPrefix ?? null,
    schema != null ? JSON.stringify(schema) : null,
    schemaSuffix,
  ]
    .filter(line => line != null)
    .join('\n');
}
