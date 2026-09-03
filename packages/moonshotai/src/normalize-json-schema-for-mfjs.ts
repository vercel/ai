import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { isRecord } from '@ai-sdk/provider-utils';

const SCHEMA_ARRAY_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;
const SCHEMA_MAP_KEYS = [
  'properties',
  'patternProperties',
  '$defs',
  'dependentSchemas',
] as const;
const SCHEMA_SINGLE_KEYS = [
  'additionalProperties',
  'propertyNames',
  'items',
  'contains',
  'not',
  'if',
  'then',
  'else',
] as const;

/**
 * Normalizes a JSON Schema to the subset Moonshot's MFJS validator accepts:
 * `object` root required, tuple `items` become `prefixItems`, and `type` next
 * to `anyOf` moves into the branches. Everything else passes through. The
 * full original schema is still used for AI SDK result validation.
 */
export function normalizeJsonSchemaForMFJS(schema: unknown): unknown {
  return normalizeDefinition(schema, true);
}

function normalizeDefinition(definition: unknown, isRoot: boolean): unknown {
  if (typeof definition === 'boolean' || !isRecord(definition)) {
    if (isRoot) {
      throw new UnsupportedFunctionalityError({
        functionality:
          'tool parameters must be a JSON Schema object with type "object" for moonshotai (MFJS)',
      });
    }
    return definition;
  }

  if (isRoot && definition.type !== 'object') {
    throw new UnsupportedFunctionalityError({
      functionality:
        'tool parameters must be a JSON Schema object with type "object" for moonshotai (MFJS)',
    });
  }

  const result: Record<string, unknown> = { ...definition };

  // Existing prefixItems stay first (they are positional).
  if (Array.isArray(result.items)) {
    const tuple = result.items;
    result.prefixItems = [
      ...(Array.isArray(result.prefixItems) ? result.prefixItems : []),
      ...tuple.map(item => normalizeDefinition(item, false)),
    ];
    delete result.items;
  } else if (isRecord(result.items)) {
    result.items = normalizeDefinition(result.items, false);
  }

  // MFJS requires type to live inside anyOf items.
  if (typeof result.type === 'string' && Array.isArray(result.anyOf)) {
    const parentType = result.type;
    delete result.type;
    result.anyOf = result.anyOf.map(branch =>
      isRecord(branch) && branch.type == null
        ? { type: parentType, ...branch }
        : branch,
    );
  }

  for (const key of SCHEMA_ARRAY_KEYS) {
    const value = result[key];
    if (Array.isArray(value)) {
      result[key] = value.map(item => normalizeDefinition(item, false));
    }
  }

  for (const key of SCHEMA_MAP_KEYS) {
    const value = result[key];
    if (isRecord(value)) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([k, v]) => [
          k,
          normalizeDefinition(v, false),
        ]),
      );
    }
  }

  for (const key of SCHEMA_SINGLE_KEYS) {
    const value = result[key];
    if (isRecord(value) || typeof value === 'boolean') {
      result[key] = normalizeDefinition(value, false);
    }
  }

  return result;
}
