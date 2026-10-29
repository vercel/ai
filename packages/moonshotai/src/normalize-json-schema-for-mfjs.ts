import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { isRecord } from '@ai-sdk/provider-utils';

const ROOT_ERROR =
  'tool and response schemas must be a JSON Schema object with type "object" for moonshotai (MFJS)';

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
 * to `anyOf` moves into the branches below the root. Everything else passes
 * through. The full original schema is still used for AI SDK result
 * validation.
 */
export function normalizeJsonSchemaForMFJS(schema: unknown): unknown {
  return normalizeDefinition(schema, true);
}

function normalizeDefinition(definition: unknown, isRoot: boolean): unknown {
  if (typeof definition === 'boolean' || !isRecord(definition)) {
    if (isRoot) {
      throw new UnsupportedFunctionalityError({
        functionality: ROOT_ERROR,
      });
    }
    return definition;
  }

  // A root union of objects (Zod z.union / discriminatedUnion of objects) is
  // an object; MFJS only needs the root to say so.
  const root =
    isRoot && definition.type === undefined && isObjectUnion(definition)
      ? { type: 'object', ...definition }
      : definition;

  if (isRoot && root.type !== 'object') {
    throw new UnsupportedFunctionalityError({
      functionality: ROOT_ERROR,
    });
  }

  const result: Record<string, unknown> = { ...root };

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

  // MFJS requires type to live inside anyOf items, except at the root, which
  // must keep type "object" (moving it leaves a typeless root that 400s).
  if (
    !isRoot &&
    typeof result.type === 'string' &&
    Array.isArray(result.anyOf)
  ) {
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

/**
 * Every `anyOf`/`oneOf` on the root is a non-empty union of object schemas.
 * Local `$ref`s (`#/$defs/X`, `#/definitions/X`) are resolved one hop. A
 * nullable branch (`type: ['object', 'null']`) is not an object: Moonshot
 * requires an object root, so such unions keep throwing.
 */
function isObjectUnion(definition: Record<string, unknown>): boolean {
  const unions = (['anyOf', 'oneOf'] as const)
    .map(key => definition[key])
    .filter(value => value !== undefined);
  return (
    unions.length > 0 &&
    unions.every(
      branches =>
        Array.isArray(branches) &&
        branches.length > 0 &&
        branches.every(branch => isObjectSchema(branch, definition)),
    )
  );
}

function isObjectSchema(
  branch: unknown,
  root: Record<string, unknown>,
): boolean {
  const resolved = resolveLocalRef(branch, root);
  return (
    isRecord(resolved) &&
    (resolved.type === 'object' ||
      (resolved.type === undefined && isRecord(resolved.properties)))
  );
}

function resolveLocalRef(
  branch: unknown,
  root: Record<string, unknown>,
): unknown {
  if (!isRecord(branch) || typeof branch.$ref !== 'string') return branch;
  const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(branch.$ref);
  if (match == null) return branch;
  const defs = root[match[1]];
  return isRecord(defs) ? defs[match[2]] : branch;
}
