import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';
import { isRecord } from './is-record';

const SUPPORTED_STRING_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid',
]);

const DESCRIPTION_CONSTRAINT_KEYS = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
  'minProperties',
  'maxProperties',
  'not',
] satisfies Array<keyof JSONSchema7>;

/**
 * Removes JSON Schema keywords that OpenAI's strict function-tool schemas
 * reject (the Responses API defaults function tools to `strict: true`), and
 * that can otherwise make OpenAI fail with a generic in-stream `server_error`
 * on gpt-5.x models while it compiles the schema into a constrained-decoding
 * grammar. The documented strict-mode subset excludes value-constraint
 * keywords such as `minItems`/`maxItems`, `minLength`/`maxLength`, `pattern`,
 * `format`, `minimum`/`maximum`, `uniqueItems`, and `minProperties`/
 * `maxProperties`.
 *
 * The full original schema is still used by AI SDK result validation. This
 * only relaxes the schema sent to OpenAI, folding the removed constraints into
 * the `description` so the model still receives them as guidance.
 */
export function sanitizeJsonSchema(schema: JSONSchema7): JSONSchema7 {
  return sanitizeSchema(schema) as JSONSchema7;
}

function sanitizeDefinition(
  definition: JSONSchema7Definition,
): JSONSchema7Definition {
  if (typeof definition === 'boolean' || !isRecord(definition)) {
    return definition;
  }

  return sanitizeSchema(definition as JSONSchema7);
}

function sanitizeSchema(schema: JSONSchema7): JSONSchema7 {
  const result: JSONSchema7 = {};
  const schemaWithDefs = schema as JSONSchema7 & {
    $defs?: Record<string, JSONSchema7Definition>;
  };

  if (schema.$ref != null) {
    return { $ref: schema.$ref };
  }

  if (schema.$schema != null) {
    result.$schema = schema.$schema;
  }

  if (schema.$id != null) {
    result.$id = schema.$id;
  }

  if (schema.title != null) {
    result.title = schema.title;
  }

  if (schema.description != null) {
    result.description = schema.description;
  }

  if (schema.default !== undefined) {
    result.default = schema.default;
  }

  if (schema.const !== undefined) {
    result.const = schema.const;
  }

  if (schema.enum != null) {
    result.enum = schema.enum;
  }

  if (schema.type != null) {
    result.type = schema.type;
  }

  if (schema.anyOf != null) {
    result.anyOf = schema.anyOf.map(sanitizeDefinition);
  } else if (schema.oneOf != null) {
    result.anyOf = schema.oneOf.map(sanitizeDefinition);
  }

  if (schema.definitions != null) {
    result.definitions = Object.fromEntries(
      Object.entries(schema.definitions).map(([name, definition]) => [
        name,
        sanitizeDefinition(definition),
      ]),
    );
  }

  if (schemaWithDefs.$defs != null) {
    const resultWithDefs = result as JSONSchema7 & {
      $defs?: Record<string, JSONSchema7Definition>;
    };
    resultWithDefs.$defs = Object.fromEntries(
      Object.entries(schemaWithDefs.$defs).map(([name, definition]) => [
        name,
        sanitizeDefinition(definition),
      ]),
    );
  }

  if (schema.type === 'object' || schema.properties != null) {
    if (schema.properties != null) {
      result.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([name, definition]) => [
          name,
          sanitizeDefinition(definition),
        ]),
      );
    }

    if (schema.additionalProperties !== undefined) {
      result.additionalProperties = schema.additionalProperties;
    }

    if (schema.required != null) {
      result.required = schema.required;
    }
  }

  if (schema.items != null) {
    result.items = Array.isArray(schema.items)
      ? schema.items.map(sanitizeDefinition)
      : sanitizeDefinition(schema.items);
  }

  if (
    typeof schema.format === 'string' &&
    SUPPORTED_STRING_FORMATS.has(schema.format)
  ) {
    result.format = schema.format;
  }

  const constraintDescription = getConstraintDescription(schema);
  if (constraintDescription != null) {
    result.description =
      result.description == null
        ? constraintDescription
        : `${result.description}\n${constraintDescription}`;
  }

  return result;
}

function getConstraintDescription(schema: JSONSchema7): string | undefined {
  const descriptions = DESCRIPTION_CONSTRAINT_KEYS.flatMap(key => {
    const value = schema[key];

    if (value == null || value === false) {
      return [];
    }

    return `${formatConstraintName(key)}: ${formatConstraintValue(value)}`;
  });

  if (
    typeof schema.format === 'string' &&
    !SUPPORTED_STRING_FORMATS.has(schema.format)
  ) {
    descriptions.push(`format: ${schema.format}`);
  }

  return descriptions.length === 0 ? undefined : `${descriptions.join('; ')}.`;
}

function formatConstraintName(key: string): string {
  return key.replace(/[A-Z]/g, match => ` ${match.toLowerCase()}`);
}

function formatConstraintValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}
