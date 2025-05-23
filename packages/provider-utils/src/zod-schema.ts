import { JSONSchema7 } from '@ai-sdk/provider';
import * as z3 from 'zod/v3';
import * as z4 from 'zod/v4/core';
import zodToJsonSchema from 'zod-to-json-schema';
import { jsonSchema, Schema } from './schema';

export function zod3Schema<OBJECT>(
  zodSchema: z3.Schema<OBJECT, z3.ZodTypeDef, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  // default to no references (to support openapi conversion for google)
  const useReferences = options?.useReferences ?? false;

  return jsonSchema(
    zodToJsonSchema(zodSchema, {
      $refStrategy: useReferences ? 'root' : 'none',
      target: 'jsonSchema7', // note: openai mode breaks various gemini conversions
    }) as JSONSchema7,
    {
      validate: value => {
        const result = zodSchema.safeParse(value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}

export function zod4Schema<OBJECT>(
  zodSchema: z4.$ZodType<OBJECT, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  // default to no references (to support openapi conversion for google)
  const useReferences = options?.useReferences ?? false;

  const z4JSONSchema = z4.toJSONSchema(zodSchema, { target: 'draft-7', reused: useReferences ? 'ref' : 'inline' }) as JSONSchema7

  enforceNoAdditionalProperties(z4JSONSchema);

  return jsonSchema(
    z4JSONSchema,
    {
      validate: value => {
        const result = z4.safeParse(zodSchema, value);
        return result.success
          ? { success: true, value: result.data }
          : { success: false, error: result.error };
      },
    },
  );
}

export function isZod4Schema(
  zodSchema: z4.$ZodType<any, any> | z3.Schema<any, z3.ZodTypeDef, any>,
): zodSchema is z4.$ZodType<any, any> {
  // https://zod.dev/library-authors?id=how-to-support-zod-3-and-zod-4-simultaneously
  return '_zod' in zodSchema;
}

export function zodSchema<OBJECT>(
  zodSchema: z4.$ZodType<OBJECT, any> | z3.Schema<OBJECT, z3.ZodTypeDef, any>,
  options?: {
    /**
     * Enables support for references in the schema.
     * This is required for recursive schemas, e.g. with `z.lazy`.
     * However, not all language models and providers support such references.
     * Defaults to `false`.
     */
    useReferences?: boolean;
  },
): Schema<OBJECT> {
  if (isZod4Schema(zodSchema)) {
    return zod4Schema(zodSchema, options);
  } else {
    return zod3Schema(zodSchema, options);
  }
}

// https://github.com/colinhacks/zod/issues/4498
function enforceNoAdditionalProperties(schema: any) {
  if (schema && typeof schema === 'object') {
    if (schema.type === 'object') {
      // Set additionalProperties to false
      schema.additionalProperties = false;

      // Recurse into properties
      if (schema.properties && typeof schema.properties === 'object') {
        for (const key in schema.properties) {
          enforceNoAdditionalProperties(schema.properties[key]);
        }
      }

      // Handle patternProperties, if any
      if (schema.patternProperties && typeof schema.patternProperties === 'object') {
        for (const key in schema.patternProperties) {
          enforceNoAdditionalProperties(schema.patternProperties[key]);
        }
      }

      // Handle dependencies that may contain schemas
      if (schema.dependencies && typeof schema.dependencies === 'object') {
        for (const key in schema.dependencies) {
          const dep = schema.dependencies[key];
          if (typeof dep === 'object' && !Array.isArray(dep)) {
            enforceNoAdditionalProperties(dep);
          }
        }
      }
    }

    // Handle combinators that may contain schemas
    ['allOf', 'anyOf', 'oneOf'].forEach((combiner) => {
      if (Array.isArray(schema[combiner])) {
        schema[combiner].forEach((subSchema: any) => enforceNoAdditionalProperties(subSchema));
      }
    });

    // Handle not
    if (schema.not) {
      enforceNoAdditionalProperties(schema.not);
    }

    // Items can be a single schema or an array of schemas
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        schema.items.forEach((itemSchema: any) => enforceNoAdditionalProperties(itemSchema));
      } else {
        enforceNoAdditionalProperties(schema.items);
      }
    }

    // If the schema defines "definitions" (used in older drafts), recurse into them too
    if (schema.definitions && typeof schema.definitions === 'object') {
      for (const key in schema.definitions) {
        enforceNoAdditionalProperties(schema.definitions[key]);
      }
    }

    // $defs is used in newer JSON Schema drafts (2020-12+)
    if (schema.$defs && typeof schema.$defs === 'object') {
      for (const key in schema.$defs) {
        enforceNoAdditionalProperties(schema.$defs[key]);
      }
    }
  }
}
