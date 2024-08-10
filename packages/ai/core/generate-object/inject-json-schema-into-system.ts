import { JSONSchema7 } from 'json-schema';

const DEFAULT_SCHEMA_PREFIX = 'JSON schema:';
const DEFAULT_SCHEMA_SUFFIX =
  'You MUST answer with a JSON object that matches the JSON schema above.';

export function injectJsonSchemaIntoSystem({
  system,
  schema,
  schemaPrefix = DEFAULT_SCHEMA_PREFIX,
  schemaSuffix = DEFAULT_SCHEMA_SUFFIX,
}: {
  system?: string;
  schema: JSONSchema7;
  schemaPrefix?: string;
  schemaSuffix?: string;
}): string {
  return [
    system,
    system != null ? '' : null, // add a newline if system is not null
    schemaPrefix,
    JSON.stringify(schema),
    schemaSuffix,
  ]
    .filter(line => line != null)
    .join('\n');
}
