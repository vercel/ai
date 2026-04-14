/**
 * Sanitizes a JSON Schema for Anthropic's `output_config.format.schema`.
 *
 * Anthropic's structured output schema endpoint strictly rejects unsupported
 * JSON Schema keywords (e.g. `exclusiveMinimum`, `pattern`, `not`), unlike
 * tool schemas where they are silently ignored. This function:
 *
 * - Strips unsupported validation keywords and moves them into `description`
 *   as hints for the model
 * - Converts `oneOf` to `anyOf` (Anthropic uses `anyOf`)
 * - Enforces `additionalProperties: false` on object schemas
 * - Only allows supported string `format` values
 * - Recursively processes nested schemas
 *
 * Logic adapted from Anthropic SDK's transformJSONSchema.
 */

const SUPPORTED_STRING_FORMATS = new Set([
  'date-time',
  'time',
  'date',
  'duration',
  'email',
  'hostname',
  'uri',
  'ipv4',
  'ipv6',
  'uuid',
]);

function pop(obj: Record<string, unknown>, key: string): unknown {
  const value = obj[key];
  delete obj[key];
  return value;
}

export function sanitizeJsonSchema(
  jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
  const workingCopy = JSON.parse(JSON.stringify(jsonSchema));
  return transform(workingCopy);
}

function transform(
  jsonSchema: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // $ref passthrough
  const ref = pop(jsonSchema, '$ref');
  if (ref !== undefined) {
    result['$ref'] = ref;
    return result;
  }

  // Process $defs recursively
  const defs = pop(jsonSchema, '$defs') as
    | Record<string, Record<string, unknown>>
    | undefined;
  if (defs !== undefined) {
    const strictDefs: Record<string, unknown> = {};
    result['$defs'] = strictDefs;
    for (const [name, defSchema] of Object.entries(defs)) {
      strictDefs[name] = transform(defSchema);
    }
  }

  const type = pop(jsonSchema, 'type') as string | undefined;
  const anyOf = pop(jsonSchema, 'anyOf') as
    | Record<string, unknown>[]
    | undefined;
  const oneOf = pop(jsonSchema, 'oneOf') as
    | Record<string, unknown>[]
    | undefined;
  const allOf = pop(jsonSchema, 'allOf') as
    | Record<string, unknown>[]
    | undefined;

  if (Array.isArray(anyOf)) {
    result['anyOf'] = anyOf.map(variant => transform(variant));
  } else if (Array.isArray(oneOf)) {
    // Convert oneOf to anyOf
    result['anyOf'] = oneOf.map(variant => transform(variant));
  } else if (Array.isArray(allOf)) {
    result['allOf'] = allOf.map(entry => transform(entry));
  } else {
    if (type === undefined) {
      throw new Error(
        'JSON schema must have a type defined if anyOf/oneOf/allOf are not used',
      );
    }
    result['type'] = type;
  }

  // Preserve description and title
  const description = pop(jsonSchema, 'description');
  if (description !== undefined) {
    result['description'] = description;
  }

  const title = pop(jsonSchema, 'title');
  if (title !== undefined) {
    result['title'] = title;
  }

  // Type-specific handling
  if (type === 'object') {
    const properties = (pop(jsonSchema, 'properties') || {}) as Record<
      string,
      Record<string, unknown>
    >;
    result['properties'] = Object.fromEntries(
      Object.entries(properties).map(([key, propSchema]) => [
        key,
        transform(propSchema),
      ]),
    );

    pop(jsonSchema, 'additionalProperties');
    result['additionalProperties'] = false;

    const required = pop(jsonSchema, 'required');
    if (required !== undefined) {
      result['required'] = required;
    }
  } else if (type === 'string') {
    const format = pop(jsonSchema, 'format') as string | undefined;
    if (format !== undefined && SUPPORTED_STRING_FORMATS.has(format)) {
      result['format'] = format;
    } else if (format !== undefined) {
      // Unsupported format — leave in jsonSchema so it gets added to description
      jsonSchema['format'] = format;
    }
  } else if (type === 'array') {
    const items = pop(jsonSchema, 'items') as
      | Record<string, unknown>
      | undefined;
    if (items !== undefined) {
      result['items'] = transform(items);
    }

    const minItems = pop(jsonSchema, 'minItems') as number | undefined;
    if (minItems !== undefined && (minItems === 0 || minItems === 1)) {
      result['minItems'] = minItems;
    } else if (minItems !== undefined) {
      // Unsupported minItems value — leave for description
      jsonSchema['minItems'] = minItems;
    }
  }

  // Any remaining keys are unsupported — move to description
  if (Object.keys(jsonSchema).length > 0) {
    const existingDescription = result['description'] as string | undefined;
    result['description'] =
      (existingDescription ? existingDescription + '\n\n' : '') +
      '{' +
      Object.entries(jsonSchema)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ') +
      '}';
  }

  return result;
}
