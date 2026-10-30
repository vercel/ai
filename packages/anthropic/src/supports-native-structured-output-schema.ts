import type { JSONSchema7 } from '@ai-sdk/provider';
import {
  hasCircularSchemaReference,
  isRecord,
  resolveSchemaPointer,
} from './has-circular-schema-reference';

// Anthropic rejects schemas with more than 24 optional properties in total,
// and grammar compilation fails earlier as optional properties add up: from 13
// on Bedrock and the Anthropic API, from 11 on Vertex (compilation timeout).
const MAX_OPTIONAL_PROPERTIES = 10;

const SUBSCHEMA_KEYWORDS = [
  'additionalProperties',
  'contains',
  'else',
  'if',
  'items',
  'not',
  'then',
];
const SUBSCHEMA_LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_MAP_KEYWORDS = [
  'dependentSchemas',
  'patternProperties',
  'properties',
];

type SchemaStats = { optionalProperties: number; hasOpenObject: boolean };

/**
 * Whether Anthropic's native structured outputs (`output_config.format`) can
 * represent a schema without rejecting it or losing data.
 *
 * Rejected: self-referencing schemas, and schemas with too many optional
 * properties. Lossy: open objects (maps, free-form objects), which native
 * structured outputs close with `additionalProperties: false`, so the model
 * can only return `{}` for them.
 */
export function supportsNativeStructuredOutputSchema(
  schema: JSONSchema7,
): boolean {
  if (hasCircularSchemaReference(schema)) {
    return false;
  }

  const { optionalProperties, hasOpenObject } = getSchemaStats(
    schema,
    schema,
    new Map(),
  );

  return !hasOpenObject && optionalProperties <= MAX_OPTIONAL_PROPERTIES;
}

function getSchemaStats(
  node: unknown,
  root: JSONSchema7,
  refStats: Map<string, SchemaStats>,
): SchemaStats {
  const stats: SchemaStats = { optionalProperties: 0, hasOpenObject: false };
  if (!isRecord(node)) {
    return stats;
  }

  const add = (child: unknown) => {
    const childStats = getSchemaStats(child, root, refStats);
    stats.optionalProperties += childStats.optionalProperties;
    stats.hasOpenObject ||= childStats.hasOpenObject;
  };

  // references are counted at every use; the schema has no cycles here:
  if (typeof node.$ref === 'string' && node.$ref.startsWith('#')) {
    let resolved = refStats.get(node.$ref);
    if (resolved == null) {
      resolved = getSchemaStats(
        resolveSchemaPointer(root, node.$ref),
        root,
        refStats,
      );
      refStats.set(node.$ref, resolved);
    }
    stats.optionalProperties += resolved.optionalProperties;
    stats.hasOpenObject ||= resolved.hasOpenObject;
  }

  if (isOpenObject(node)) {
    stats.hasOpenObject = true;
  }

  if (isRecord(node.properties)) {
    const required = new Set(Array.isArray(node.required) ? node.required : []);
    stats.optionalProperties += Object.keys(node.properties).filter(
      name => !required.has(name),
    ).length;
  }

  for (const keyword of SUBSCHEMA_KEYWORDS) {
    const value = node[keyword];
    if (Array.isArray(value)) {
      value.forEach(add);
    } else {
      add(value);
    }
  }
  for (const keyword of SUBSCHEMA_LIST_KEYWORDS) {
    const value = node[keyword];
    if (Array.isArray(value)) {
      value.forEach(add);
    }
  }
  for (const keyword of SUBSCHEMA_MAP_KEYWORDS) {
    const value = node[keyword];
    if (isRecord(value)) {
      Object.values(value).forEach(add);
    }
  }

  return stats;
}

function isOpenObject(node: Record<string, unknown>): boolean {
  const { additionalProperties, patternProperties, properties, type } = node;

  if (additionalProperties === true || isRecord(additionalProperties)) {
    return true;
  }
  if (
    isRecord(patternProperties) &&
    Object.keys(patternProperties).length > 0
  ) {
    return true;
  }

  const isObjectType =
    type === 'object' || (Array.isArray(type) && type.includes('object'));
  return isObjectType && properties == null && additionalProperties !== false;
}
