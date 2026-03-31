/**
 * Helpers for passing tool schemas across workflow step boundaries.
 *
 * Zod schemas (and other standard-schema-compatible schemas) contain functions
 * and cannot be serialized by the workflow runtime. These helpers convert
 * schemas to plain JSON Schema objects for serialization, then reconstruct
 * them inside step functions with validation via Ajv.
 */
import type { JSONSchema7 } from '@ai-sdk/provider';
import {
  asSchema,
  jsonSchema,
  type FlexibleSchema,
} from '@ai-sdk/provider-utils';
import { tool, type ToolSet } from 'ai';
import Ajv from 'ajv';

/**
 * Converts a zod schema (or any standard-schema-compatible schema) to a plain
 * JSON Schema object that can be serialized across workflow step boundaries.
 */
export function toJsonSchema<T>(schema: FlexibleSchema<T>): JSONSchema7 {
  const resolved = asSchema(schema);
  const js = resolved.jsonSchema;

  // asSchema().jsonSchema can be a Promise for lazy schemas,
  // but for zod/standard schemas it's always synchronous
  if (js && typeof (js as any).then === 'function') {
    throw new Error(
      'toJsonSchema does not support async/lazy schemas. ' +
        'Pass a synchronous schema (e.g., a zod schema).',
    );
  }

  return js as JSONSchema7;
}

/**
 * Serializable tool definition — plain objects only, safe for workflow steps.
 */
export type SerializableToolDef = {
  description?: string;
  inputSchema: JSONSchema7;
};

/**
 * Converts a ToolSet (with zod schemas and execute functions) to a serializable
 * record of tool definitions. Only description and inputSchema (as JSON Schema)
 * are preserved — execute functions are stripped since they run outside the step.
 */
export function serializeToolSet(
  tools: ToolSet,
): Record<string, SerializableToolDef> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
      name,
      {
        description: t.description,
        inputSchema: toJsonSchema(t.inputSchema),
      },
    ]),
  );
}

/**
 * Reconstructs tool objects from serializable tool definitions inside a step.
 *
 * Wraps each tool's JSON Schema with `jsonSchema()` and validates tool call
 * arguments against the schema using Ajv. This provides runtime type safety
 * equivalent to using zod schemas directly with the AI SDK.
 */
export function resolveSerializableTools(
  tools: Record<string, SerializableToolDef>,
): Record<string, ReturnType<typeof tool>> {
  const ajv = new Ajv();

  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => {
      const validateFn = ajv.compile(t.inputSchema);

      return [
        name,
        tool({
          description: t.description,
          inputSchema: jsonSchema(t.inputSchema, {
            validate: value => {
              if (validateFn(value)) {
                return { success: true, value: value as any };
              }
              return {
                success: false,
                error: new Error(ajv.errorsText(validateFn.errors)),
              };
            },
          }),
        }),
      ];
    }),
  );
}
