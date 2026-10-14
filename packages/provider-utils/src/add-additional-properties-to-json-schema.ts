import type { JSONSchema7, JSONSchema7Definition } from '@ai-sdk/provider';

/**
 * Recursively adds additionalProperties: false to object schemas that do not
 * define a schema for their additional properties. This is necessary because
 * some providers (e.g. OpenAI) do not support additionalProperties: true.
 *
 * Object schemas that are branches of an `allOf` are left open: every branch
 * of an intersection has to accept the properties that its sibling branches
 * contribute, so closing each branch would make the intersection
 * unsatisfiable. Properties nested inside such a branch are still closed.
 */
export function addAdditionalPropertiesToJsonSchema(
  jsonSchema: JSONSchema7,
): JSONSchema7 {
  return addAdditionalProperties(jsonSchema, { closeObject: true });
}

function addAdditionalProperties(
  jsonSchema: JSONSchema7,
  { closeObject }: { closeObject: boolean },
): JSONSchema7 {
  if (
    jsonSchema.type === 'object' ||
    (Array.isArray(jsonSchema.type) && jsonSchema.type.includes('object'))
  ) {
    const { additionalProperties } = jsonSchema;
    if (
      additionalProperties != null &&
      typeof additionalProperties !== 'boolean'
    ) {
      jsonSchema.additionalProperties = visit(additionalProperties, {
        closeObject: true,
      });
    } else if (closeObject) {
      jsonSchema.additionalProperties = false;
    }

    const { properties } = jsonSchema;
    if (properties != null) {
      for (const key of Object.keys(properties)) {
        properties[key] = visit(properties[key], { closeObject: true });
      }
    }
  }

  if (jsonSchema.items != null) {
    jsonSchema.items = Array.isArray(jsonSchema.items)
      ? jsonSchema.items.map(item => visit(item, { closeObject: true }))
      : visit(jsonSchema.items, { closeObject: true });
  }

  // a branch of anyOf/oneOf stands on its own, so it is closed like its parent;
  // a branch of allOf is intersected with its siblings and must stay open.
  if (jsonSchema.anyOf != null) {
    jsonSchema.anyOf = jsonSchema.anyOf.map(branch =>
      visit(branch, { closeObject }),
    );
  }

  if (jsonSchema.allOf != null) {
    jsonSchema.allOf = jsonSchema.allOf.map(branch =>
      visit(branch, { closeObject: false }),
    );
  }

  if (jsonSchema.oneOf != null) {
    jsonSchema.oneOf = jsonSchema.oneOf.map(branch =>
      visit(branch, { closeObject }),
    );
  }

  const { definitions } = jsonSchema;
  if (definitions != null) {
    for (const key of Object.keys(definitions)) {
      definitions[key] = visit(definitions[key], { closeObject: true });
    }
  }

  return jsonSchema;
}

function visit(
  def: JSONSchema7Definition,
  options: { closeObject: boolean },
): JSONSchema7Definition {
  if (typeof def === 'boolean') return def;
  return addAdditionalProperties(def, options);
}
