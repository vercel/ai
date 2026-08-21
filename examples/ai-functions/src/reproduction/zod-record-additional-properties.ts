import { asSchema, jsonSchema } from 'ai';
import { z } from 'zod/v4';

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
  additionalProperties?: unknown;
};

function additionalProperties(schema: unknown, property?: string): unknown {
  if (typeof schema !== 'object' || schema == null) {
    return undefined;
  }

  const schemaObject = schema as JsonSchemaObject;
  const target =
    property == null ? schemaObject : schemaObject.properties?.[property];

  return typeof target === 'object' && target != null
    ? (target as JsonSchemaObject).additionalProperties
    : undefined;
}

function assertJsonEqual(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${message}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function main() {
  const recordInputSchema = z.object({
    values: z.record(z.string(), z.string()),
  });
  const catchallInputSchema = z
    .object({ fixed: z.string() })
    .catchall(z.number());

  const recordZodJsonSchema = z.toJSONSchema(recordInputSchema, {
    target: 'draft-7',
    io: 'input',
  });
  const catchallZodJsonSchema = z.toJSONSchema(catchallInputSchema, {
    target: 'draft-7',
    io: 'input',
  });

  const convertedRecordSchema = asSchema(
    recordInputSchema as unknown as Parameters<typeof asSchema>[0],
  );
  const convertedCatchallSchema = asSchema(
    catchallInputSchema as unknown as Parameters<typeof asSchema>[0],
  );
  const wrappedRecordSchema = asSchema(
    jsonSchema(recordZodJsonSchema as Parameters<typeof jsonSchema>[0]),
  );
  const wrappedCatchallSchema = asSchema(
    jsonSchema(catchallZodJsonSchema as Parameters<typeof jsonSchema>[0]),
  );

  const expectedRecordValueSchema = additionalProperties(
    recordZodJsonSchema,
    'values',
  );
  const expectedCatchallValueSchema = additionalProperties(
    catchallZodJsonSchema,
  );

  assertJsonEqual(
    expectedRecordValueSchema,
    { type: 'string' },
    'Zod record precondition failed',
  );
  assertJsonEqual(
    expectedCatchallValueSchema,
    { type: 'number' },
    'Zod catchall precondition failed',
  );
  assertJsonEqual(
    additionalProperties(wrappedRecordSchema.jsonSchema, 'values'),
    expectedRecordValueSchema,
    'jsonSchema record control changed the value schema',
  );
  assertJsonEqual(
    additionalProperties(wrappedCatchallSchema.jsonSchema),
    expectedCatchallValueSchema,
    'jsonSchema catchall control changed the value schema',
  );

  const validation = await convertedRecordSchema.validate?.({
    values: { alpha: 'one' },
  });
  if (validation?.success !== true) {
    throw new Error(
      'Zod validation precondition failed for a populated record input',
    );
  }

  const actualRecordValueSchema = additionalProperties(
    convertedRecordSchema.jsonSchema,
    'values',
  );
  const actualCatchallValueSchema = additionalProperties(
    convertedCatchallSchema.jsonSchema,
  );

  console.log(
    'z.record additionalProperties:',
    JSON.stringify(actualRecordValueSchema),
  );
  console.log(
    'object catchall additionalProperties:',
    JSON.stringify(actualCatchallValueSchema),
  );

  if (
    JSON.stringify(actualRecordValueSchema) !==
      JSON.stringify(expectedRecordValueSchema) ||
    JSON.stringify(actualCatchallValueSchema) !==
      JSON.stringify(expectedCatchallValueSchema)
  ) {
    throw new Error(
      'Issue #17871 reproduced: AI SDK changed schema-valued additionalProperties to false',
    );
  }
}

await main();
