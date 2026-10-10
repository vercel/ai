import type { JSONSchema7 } from '@ai-sdk/provider';

const arrayItemSchemaPath = '#/properties/elements/items';

export function createArrayOutputSchema({
  elementSchema,
  minItems,
  maxItems,
}: {
  elementSchema: JSONSchema7;
  minItems?: number;
  maxItems?: number;
}): JSONSchema7 {
  const {
    $schema: _$schema,
    definitions,
    $defs,
    ...itemSchema
  } = elementSchema as JSONSchema7 & {
    $defs?: JSONSchema7['definitions'];
  };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    ...(definitions != null && {
      definitions: rebaseRootReferences(definitions),
    }),
    ...($defs != null && { $defs: rebaseRootReferences($defs) }),
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        items: rebaseRootReferences(itemSchema),
        ...(minItems != null && { minItems }),
        ...(maxItems != null && { maxItems }),
      },
    },
    required: ['elements'],
    additionalProperties: false,
  };
}

function rebaseRootReferences<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(rebaseRootReferences) as T;
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      key === '$ref' && typeof nestedValue === 'string'
        ? rebaseRootReference(nestedValue)
        : rebaseRootReferences(nestedValue),
    ]),
  ) as T;
}

function rebaseRootReference(reference: string): string {
  if (reference === '#') {
    return arrayItemSchemaPath;
  }

  if (
    !reference.startsWith('#/') ||
    reference === '#/definitions' ||
    reference.startsWith('#/definitions/') ||
    reference === '#/$defs' ||
    reference.startsWith('#/$defs/')
  ) {
    return reference;
  }

  return `${arrayItemSchemaPath}${reference.slice(1)}`;
}
