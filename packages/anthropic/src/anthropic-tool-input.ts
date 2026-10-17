import {
  InvalidResponseDataError,
  UnsupportedFunctionalityError,
  type JSONObject,
  type JSONSchema7,
  type JSONSchema7Definition,
  type JSONValue,
  type LanguageModelV4FunctionTool,
} from '@ai-sdk/provider';
import { isRecord } from '@ai-sdk/provider-utils';

const wrapperKey = '__ai_sdk_tool_input';

export function needsToolInputWrapping(schema: JSONSchema7): boolean {
  return (
    schema.type !== 'object' ||
    schema.$ref != null ||
    schema.anyOf != null ||
    schema.oneOf != null ||
    schema.allOf != null
  );
}

export function wrapToolInput(input: unknown): JSONObject {
  return { [wrapperKey]: input as JSONValue };
}

export function unwrapToolInput(input: unknown, toolName: string): JSONValue {
  if (
    !isRecord(input) ||
    !Object.prototype.hasOwnProperty.call(input, wrapperKey) ||
    Object.keys(input).length !== 1
  ) {
    throw new InvalidResponseDataError({
      data: input,
      message: `Tool '${toolName}' returned invalid wrapped input. Expected an object containing only '${wrapperKey}'.`,
    });
  }

  return input[wrapperKey] as JSONValue;
}

export function wrapToolInputSchema(
  tool: LanguageModelV4FunctionTool,
): LanguageModelV4FunctionTool {
  return {
    ...tool,
    inputSchema: {
      ...(tool.inputSchema.$schema != null && {
        $schema: tool.inputSchema.$schema,
      }),
      type: 'object',
      properties: {
        [wrapperKey]: relocateReferences(tool.inputSchema, tool.name),
      },
      required: [wrapperKey],
      additionalProperties: false,
    },
    ...(tool.inputExamples != null && {
      inputExamples: tool.inputExamples.map(example => ({
        input: wrapToolInput(example.input),
      })),
    }),
  };
}

/**
 * Moving a schema below a property changes the target of document-relative
 * JSON pointers. Only visit schema positions: a $ref inside a const, default,
 * enum, or example is application data.
 */
function relocateReferences(
  schema: JSONSchema7Definition,
  toolName: string,
): JSONSchema7Definition {
  if (typeof schema === 'boolean') {
    return schema;
  }

  const source = schema as Record<string, unknown>;
  const result = { ...source };

  // Resource identifiers and dynamic references need scope-aware relocation.
  for (const keyword of [
    '$id',
    'id',
    '$anchor',
    '$dynamicAnchor',
    '$dynamicRef',
    '$recursiveAnchor',
    '$recursiveRef',
  ]) {
    if (source[keyword] != null) {
      throw new UnsupportedFunctionalityError({
        functionality: 'automatic Anthropic tool input wrapping',
        message: `Tool '${toolName}' uses '${keyword}', which cannot be automatically relocated. Wrap its input schema in an object property explicitly.`,
      });
    }
  }

  if (typeof source.$ref === 'string') {
    let fragment: string | undefined;
    if (source.$ref.startsWith('#')) {
      try {
        fragment = decodeURIComponent(source.$ref.slice(1));
      } catch {
        // Invalid URI fragments cannot be relocated.
      }
    }
    if (fragment === '' || fragment?.startsWith('/')) {
      result.$ref = `#/properties/${wrapperKey}${source.$ref.slice(1)}`;
    } else {
      throw new UnsupportedFunctionalityError({
        functionality: 'automatic Anthropic tool input wrapping',
        message: `Tool '${toolName}' uses a reference that is not a local JSON pointer. Wrap its input schema in an object property explicitly.`,
      });
    }
  }

  for (const keyword of [
    'properties',
    'patternProperties',
    'definitions',
    '$defs',
    'dependentSchemas',
    'dependencies',
  ]) {
    const definitions = source[keyword];
    if (isRecord(definitions)) {
      result[keyword] = Object.fromEntries(
        Object.entries(definitions).map(([key, value]) => [
          key,
          Array.isArray(value)
            ? value // draft-07 property dependencies are string arrays
            : relocateReferences(value as JSONSchema7Definition, toolName),
        ]),
      );
    }
  }

  for (const keyword of [
    'items',
    'prefixItems',
    'additionalItems',
    'additionalProperties',
    'unevaluatedItems',
    'unevaluatedProperties',
    'contains',
    'propertyNames',
    'not',
    'if',
    'then',
    'else',
    'allOf',
    'anyOf',
    'oneOf',
    'contentSchema',
  ]) {
    const value = source[keyword];
    if (value != null) {
      result[keyword] = Array.isArray(value)
        ? value.map(item => relocateReferences(item, toolName))
        : relocateReferences(value as JSONSchema7Definition, toolName);
    }
  }

  return result as JSONSchema7;
}
