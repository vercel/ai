import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Bedrock's native structured-output compiler (`output_config.format.schema`)
 * rejects a schema that has more than this many union-typed parameters with:
 *
 *   Schemas contains too many parameters with union types (N parameters with
 *   type arrays or anyOf). This causes exponential compilation cost. Reduce the
 *   number of nullable or union-typed parameters (limit: 16 parameters with
 *   unions).
 *
 * A "union-typed parameter" is any schema node whose type is expressed as a
 * union: an `anyOf`/`oneOf` node or a `type` array (e.g. a nullable field
 * `{ type: ['string', 'null'] }`). Since the tool-based JSON path has no such
 * limit, we count these to decide which path a given schema can use.
 */
export const BEDROCK_NATIVE_STRUCTURED_OUTPUT_UNION_LIMIT = 16;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnionNode(schema: JSONSchema7): boolean {
  return (
    schema.anyOf != null || schema.oneOf != null || Array.isArray(schema.type)
  );
}

/**
 * Recursively counts union-typed parameters in a JSON schema, matching what
 * Bedrock's native structured-output compiler counts toward its 16-union limit.
 *
 * Definitions (`$defs`/`definitions`) are counted once; `$ref` nodes are not
 * followed (they carry no union of their own). This is a close upper bound on
 * Bedrock's own count and is only used as a routing threshold, so exactness is
 * not required — a schema is either comfortably under the limit (native
 * constrained decoding) or well over it (tool-based fallback).
 */
export function countUnionTypedParameters(
  schema: JSONSchema7Definition,
): number {
  if (typeof schema === 'boolean' || !isPlainObject(schema)) {
    return 0;
  }

  const node = schema as JSONSchema7 & {
    $defs?: Record<string, JSONSchema7Definition>;
  };

  let count = isUnionNode(node) ? 1 : 0;

  for (const branch of [node.anyOf, node.oneOf, node.allOf]) {
    if (branch != null) {
      count += branch.reduce(
        (sum, definition) => sum + countUnionTypedParameters(definition),
        0,
      );
    }
  }

  if (node.properties != null) {
    count += Object.values(node.properties).reduce(
      (sum, definition) => sum + countUnionTypedParameters(definition),
      0,
    );
  }

  if (node.items != null) {
    count += Array.isArray(node.items)
      ? node.items.reduce(
          (sum, definition) => sum + countUnionTypedParameters(definition),
          0,
        )
      : countUnionTypedParameters(node.items);
  }

  if (isPlainObject(node.additionalProperties)) {
    count += countUnionTypedParameters(
      node.additionalProperties as JSONSchema7Definition,
    );
  }

  for (const definitions of [node.definitions, node.$defs]) {
    if (definitions != null) {
      count += Object.values(definitions).reduce(
        (sum, definition) => sum + countUnionTypedParameters(definition),
        0,
      );
    }
  }

  return count;
}
