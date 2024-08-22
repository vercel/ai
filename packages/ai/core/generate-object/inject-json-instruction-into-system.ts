import { JSONSchema7 } from 'json-schema';

const DEFAULT_SCHEMA_PREFIX = 'JSON schema:';
const DEFAULT_SCHEMA_SUFFIX =
  'You MUST answer with a JSON object that matches the JSON schema above.';

// TODO test
export function injectJsonInstructionIntoSystem({
  system,
  schema,
  schemaPrefix = schema != null ? DEFAULT_SCHEMA_PREFIX : undefined,
  schemaSuffix = schema != null
    ? DEFAULT_SCHEMA_SUFFIX
    : 'You MUST answer with JSON',
}: {
  system?: string;
  schema?: JSONSchema7;
  schemaPrefix?: string;
  schemaSuffix?: string;
}): string {
  return [
    system,
    system != null ? '' : null, // add a newline if system is not null
    schemaPrefix ?? null,
    schema != null ? JSON.stringify(schema) : null,
    schemaSuffix,
  ]
    .filter(line => line != null)
    .join('\n');
}
