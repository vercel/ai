import type { JSONSchema7 } from '@ai-sdk/provider';
import { isRecord } from '@ai-sdk/provider-utils';

// Keywords whose values are maps of name -> schema rather than a schema.
const SCHEMA_MAP_KEYWORDS = new Set([
  'dependentSchemas',
  'patternProperties',
  'properties',
]);

// Keywords holding instance data, which can contain a literal `$ref` key.
const DATA_KEYWORDS = new Set(['const', 'default', 'enum', 'examples']);

/**
 * Whether a JSON schema contains a cycle of local `$ref`s, e.g. a tree node
 * whose children reference the node itself.
 *
 * Anthropic's native structured outputs reject such schemas, while the JSON
 * response tool accepts them.
 */
export function hasCircularSchemaReference(schema: JSONSchema7): boolean {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (pointer: string): boolean => {
    if (visiting.has(pointer)) {
      return true;
    }
    if (visited.has(pointer)) {
      return false;
    }

    const target = resolveSchemaPointer(schema, pointer);
    if (target === undefined) {
      return false;
    }

    visiting.add(pointer);
    const isCircular = collectLocalRefs(target).some(visit);
    visiting.delete(pointer);
    visited.add(pointer);

    return isCircular;
  };

  return visit('#');
}

function collectLocalRefs(node: unknown, refs: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectLocalRefs(item, refs);
    }
    return refs;
  }

  if (!isRecord(node)) {
    return refs;
  }

  for (const [key, value] of Object.entries(node)) {
    if (key === '$ref') {
      if (typeof value === 'string' && value.startsWith('#')) {
        refs.push(value);
      }
    } else if (SCHEMA_MAP_KEYWORDS.has(key) && isRecord(value)) {
      for (const subschema of Object.values(value)) {
        collectLocalRefs(subschema, refs);
      }
    } else if (
      // definitions are only reached through a `$ref`:
      key !== '$defs' &&
      key !== 'definitions' &&
      !DATA_KEYWORDS.has(key)
    ) {
      collectLocalRefs(value, refs);
    }
  }

  return refs;
}

export function resolveSchemaPointer(
  schema: JSONSchema7,
  pointer: string,
): unknown {
  if (pointer === '#') {
    return schema;
  }
  if (!pointer.startsWith('#/')) {
    return undefined;
  }

  let decodedPointer: string;
  try {
    decodedPointer = decodeURIComponent(pointer.slice(2));
  } catch {
    return undefined;
  }

  let current: unknown = schema;
  for (const rawSegment of decodedPointer.split('/')) {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');

    if (Array.isArray(current)) {
      current = current[Number(segment)];
    } else if (isRecord(current)) {
      current = current[segment];
    } else {
      return undefined;
    }
  }

  return current;
}
