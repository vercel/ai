import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

// Bedrock's native structured-output compiler (`output_config.format.schema`)
// 400s when a schema exceeds its complexity limits. Two limits a single JSON
// output schema can hit: 16 union-typed parameters (`anyOf`/`oneOf` or a `type`
// array) and 24 optional parameters. The tool-based JSON path has no such
// limits, so we count these and route over-limit schemas there. Bedrock also
// counts across all strict schemas in a request and enforces internal
// grammar-size/timeout limits that can't be derived from the schema; those are
// not covered here.
export const BEDROCK_NATIVE_STRUCTURED_OUTPUT_UNION_LIMIT = 16;
export const BEDROCK_NATIVE_STRUCTURED_OUTPUT_OPTIONAL_LIMIT = 24;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnionNode(schema: JSONSchema7): boolean {
  return (
    schema.anyOf != null || schema.oneOf != null || Array.isArray(schema.type)
  );
}

function asSchemaNode(
  schema: JSONSchema7Definition,
): (JSONSchema7 & { $defs?: Record<string, JSONSchema7Definition> }) | null {
  if (typeof schema === 'boolean' || !isPlainObject(schema)) {
    return null;
  }
  return schema as JSONSchema7 & {
    $defs?: Record<string, JSONSchema7Definition>;
  };
}

function sumChildren(
  node: JSONSchema7 & { $defs?: Record<string, JSONSchema7Definition> },
  count: (definition: JSONSchema7Definition) => number,
): number {
  let total = 0;

  for (const branch of [node.anyOf, node.oneOf, node.allOf]) {
    if (branch != null) {
      total += branch.reduce((sum, definition) => sum + count(definition), 0);
    }
  }

  if (node.properties != null) {
    total += Object.values(node.properties).reduce(
      (sum, definition) => sum + count(definition),
      0,
    );
  }

  if (node.items != null) {
    total += Array.isArray(node.items)
      ? node.items.reduce((sum, definition) => sum + count(definition), 0)
      : count(node.items);
  }

  if (isPlainObject(node.additionalProperties)) {
    total += count(node.additionalProperties as JSONSchema7Definition);
  }

  for (const definitions of [node.definitions, node.$defs]) {
    if (definitions != null) {
      total += Object.values(definitions).reduce(
        (sum, definition) => sum + count(definition),
        0,
      );
    }
  }

  return total;
}

// Counts union-typed nodes (`anyOf`/`oneOf` or a `type` array). `$defs` are
// counted once; `$ref` nodes are not followed, so this is a close upper bound
// used only as a routing threshold.
export function countUnionTypedParameters(
  schema: JSONSchema7Definition,
): number {
  const node = asSchemaNode(schema);
  if (node == null || node.$ref != null) {
    return 0;
  }
  return (
    (isUnionNode(node) ? 1 : 0) + sumChildren(node, countUnionTypedParameters)
  );
}

// Counts object properties not listed in their object's `required`.
export function countOptionalParameters(schema: JSONSchema7Definition): number {
  const node = asSchemaNode(schema);
  if (node == null || node.$ref != null) {
    return 0;
  }

  let count = 0;
  if (node.properties != null) {
    const required = new Set(node.required ?? []);
    count += Object.keys(node.properties).filter(
      name => !required.has(name),
    ).length;
  }

  return count + sumChildren(node, countOptionalParameters);
}

export interface NativeStructuredOutputLimitCheck {
  withinLimits: boolean;
  unionParameterCount: number;
  optionalParameterCount: number;
  reason?: string;
}

// Checks an (already sanitized) JSON output schema against Bedrock's countable
// native limits; when over, the caller routes to the tool-based JSON path.
export function checkNativeStructuredOutputLimits(
  schema: JSONSchema7,
): NativeStructuredOutputLimitCheck {
  const unionParameterCount = countUnionTypedParameters(schema);
  const optionalParameterCount = countOptionalParameters(schema);

  const reasons: string[] = [];
  if (unionParameterCount > BEDROCK_NATIVE_STRUCTURED_OUTPUT_UNION_LIMIT) {
    reasons.push(
      `${unionParameterCount} union-typed parameters (limit ${BEDROCK_NATIVE_STRUCTURED_OUTPUT_UNION_LIMIT})`,
    );
  }
  if (
    optionalParameterCount > BEDROCK_NATIVE_STRUCTURED_OUTPUT_OPTIONAL_LIMIT
  ) {
    reasons.push(
      `${optionalParameterCount} optional parameters (limit ${BEDROCK_NATIVE_STRUCTURED_OUTPUT_OPTIONAL_LIMIT})`,
    );
  }

  return {
    withinLimits: reasons.length === 0,
    unionParameterCount,
    optionalParameterCount,
    reason:
      reasons.length === 0
        ? undefined
        : `Structured output schema exceeds Bedrock's native structured-output limits (${reasons.join(
            '; ',
          )}); falling back to tool-based JSON output.`,
  };
}
