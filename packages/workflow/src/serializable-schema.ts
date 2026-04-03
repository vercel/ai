/**
 * Helpers for passing tool schemas across workflow step boundaries.
 *
 * Tool schemas (zod, valibot, arktype, etc.) contain functions that can't be
 * serialized by the workflow runtime. These helpers extract JSON Schema from
 * schemas, then reconstruct tools with Ajv validation inside step functions.
 *
 * Uses `asSchema()` from `@ai-sdk/provider-utils` for JSON Schema extraction,
 * which supports Standard Schema compatible libraries. When libraries adopt
 * `~standard.jsonSchema` (Standard Schema v2), extraction can be simplified
 * to use that interface directly.
 */
import type { JSONSchema7 } from '@ai-sdk/provider';
import { asSchema, jsonSchema } from '@ai-sdk/provider-utils';
import { tool, type ToolSet } from 'ai';
import Ajv from 'ajv';

/**
 * Serializable tool definition — plain objects only, safe for workflow steps.
 */
export type SerializableToolDef = {
  description?: string;
  inputSchema: JSONSchema7;
};

/**
 * Converts a ToolSet (with zod/standard schemas and execute functions) to a
 * serializable record of tool definitions. Only description and inputSchema
 * (as JSON Schema) are preserved — execute functions are stripped since they
 * run outside the step.
 */
export function serializeToolSet(
  tools: ToolSet,
): Record<string, SerializableToolDef> {
  return Object.fromEntries(
    Object.entries(tools).map(([name, t]) => [
      name,
      {
        description: t.description,
        inputSchema: asSchema(t.inputSchema).jsonSchema as JSONSchema7,
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
): ToolSet {
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
