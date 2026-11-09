import type {
  JSONObject,
  JSONSchema7,
  JSONValue,
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
} from '@ai-sdk/provider';
import { isRecord, secureJsonParse } from '@ai-sdk/provider-utils';

/**
 * Anthropic requires the root of a tool input schema to be `type: "object"`
 * without top-level `anyOf`, `oneOf` or `allOf`. Zod unions, discriminated
 * unions and intersections (and `$ref` roots) produce such roots.
 *
 * Tools with these schemas are sent with their schema nested in an `input`
 * property of an object, and the `input` property is unwrapped again when the
 * model calls the tool (and wrapped again when a tool call is replayed from the
 * message history). The wrapped shape never leaves the provider, so AI SDK
 * validates the unwrapped input against the original schema.
 */
const WRAPPER_PROPERTY = 'input';

export function needsToolInputWrapping(schema: JSONSchema7): boolean {
  return (
    schema.type !== 'object' ||
    schema.anyOf != null ||
    schema.oneOf != null ||
    schema.allOf != null
  );
}

/**
 * Names of the function tools whose input is sent wrapped. Later entries win
 * when tool names collide.
 */
export function getWrappedToolInputNames(
  tools: ReadonlyArray<
    LanguageModelV4FunctionTool | LanguageModelV4ProviderTool
  >,
): Set<string> {
  const wrapped = new Map<string, boolean>();

  for (const tool of tools) {
    if (tool.type === 'function') {
      wrapped.set(tool.name, needsToolInputWrapping(tool.inputSchema));
    }
  }

  return new Set(
    [...wrapped].filter(([, isWrapped]) => isWrapped).map(([n]) => n),
  );
}

export function wrapToolInputSchema(schema: JSONSchema7): JSONSchema7 {
  const { $schema, definitions, $defs, ...inner } = schema as JSONSchema7 & {
    $defs?: JSONSchema7['definitions'];
  };

  // definitions have to stay at the root so `#/definitions/...` references
  // keep resolving:
  return {
    ...($schema != null && { $schema }),
    ...(definitions != null && {
      definitions: rewriteRootReferences(definitions),
    }),
    ...($defs != null && {
      $defs: rewriteRootReferences($defs),
    }),
    type: 'object' as const,
    properties: {
      [WRAPPER_PROPERTY]: rewriteRootReferences(inner),
    },
    required: [WRAPPER_PROPERTY],
    additionalProperties: false,
  };
}

/**
 * Wraps tool input for the message history (tool calls are replayed as the
 * object the wrapped schema describes). The input is the already parsed
 * value, so strings are kept as they are instead of being parsed again.
 */
export function wrapToolInput(input: unknown): JSONObject {
  return { [WRAPPER_PROPERTY]: input as JSONValue };
}

/**
 * Unwraps the input of a tool call. Input that does not have the wrapped
 * shape is returned as is, so schema validation reports it.
 */
export function unwrapToolInput(input: unknown): unknown {
  return isRecord(input) &&
    Object.keys(input).length === 1 &&
    WRAPPER_PROPERTY in input
    ? input[WRAPPER_PROPERTY]
    : input;
}

/**
 * Unwraps tool input that is a JSON string. Returns the string as is when it
 * is not valid JSON.
 */
export function unwrapToolInputString(input: string): string {
  try {
    return JSON.stringify(unwrapToolInput(secureJsonParse(input)));
  } catch {
    return input;
  }
}

// A reference to the schema root (`#`, `#/properties/a`) has to point into the
// wrapper property instead. References to definitions stay valid.
function rewriteRootReferences<T>(node: T): T {
  if (Array.isArray(node)) {
    return node.map(rewriteRootReferences) as T;
  }

  if (!isRecord(node)) {
    return node;
  }

  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      if (key === '$ref' && typeof value === 'string') {
        return [key, rewriteReference(value)];
      }
      return [key, rewriteRootReferences(value)];
    }),
  ) as T;
}

function rewriteReference(ref: string): string {
  const target = `#/properties/${WRAPPER_PROPERTY}`;

  if (ref === '#') {
    return target;
  }

  return ref.startsWith('#/') &&
    !ref.startsWith('#/definitions') &&
    !ref.startsWith('#/$defs')
    ? `${target}${ref.slice(1)}`
    : ref;
}
