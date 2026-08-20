import assert from 'node:assert/strict';
import { asSchema, jsonSchema } from 'ai';
import * as z from 'zod/v4';

function getAdditionalProperties(
  schema: unknown,
  propertyName?: string,
): unknown {
  if (typeof schema !== 'object' || schema == null) {
    return undefined;
  }

  const objectSchema = schema as Record<string, unknown>;
  if (propertyName == null) {
    return objectSchema.additionalProperties;
  }

  const properties = objectSchema.properties;
  if (typeof properties !== 'object' || properties == null) {
    return undefined;
  }

  return getAdditionalProperties(
    (properties as Record<string, unknown>)[propertyName],
  );
}

async function inspectConversion({
  name,
  inputSchema,
  propertyName,
}: {
  name: string;
  inputSchema: z.core.$ZodType;
  propertyName?: string;
}) {
  const zodJsonSchema = z.toJSONSchema(inputSchema, {
    target: 'draft-7',
    io: 'input',
  });
  const convertedJsonSchema = await asSchema(inputSchema).jsonSchema;
  const wrappedJsonSchema = await asSchema(
    jsonSchema(zodJsonSchema as Parameters<typeof jsonSchema>[0]),
  ).jsonSchema;

  const expected = getAdditionalProperties(zodJsonSchema, propertyName);
  const actual = getAdditionalProperties(convertedJsonSchema, propertyName);
  const wrapped = getAdditionalProperties(wrappedJsonSchema, propertyName);

  console.log(`${name} z.toJSONSchema:`, JSON.stringify(expected));
  console.log(`${name} asSchema(Zod):`, JSON.stringify(actual));
  console.log(`${name} asSchema(jsonSchema(...)):`, JSON.stringify(wrapped));

  assert.deepStrictEqual(
    wrapped,
    expected,
    `${name}: jsonSchema() control must preserve additionalProperties`,
  );

  return { actual, expected };
}

async function main() {
  const recordInputSchema = z.object({
    values: z.record(z.string(), z.string()),
  });
  const catchallInputSchema = z
    .object({ known: z.string() })
    .catchall(z.number());

  const record = await inspectConversion({
    name: 'z.record()',
    inputSchema: recordInputSchema,
    propertyName: 'values',
  });
  const catchall = await inspectConversion({
    name: 'object catchall',
    inputSchema: catchallInputSchema,
  });

  const validationResult = await asSchema(recordInputSchema).validate?.({
    values: { example: 'accepted by Zod' },
  });
  console.log(
    'original Zod validation accepts a populated record:',
    validationResult?.success,
  );
  assert.equal(
    validationResult?.success,
    true,
    'Zod validation must accept the populated record used by the reproduction',
  );

  assert.deepStrictEqual(
    {
      record: record.actual,
      catchall: catchall.actual,
    },
    {
      record: record.expected,
      catchall: catchall.expected,
    },
    'Issue #17871: AI SDK must preserve schema-valued additionalProperties for z.record() and object catchalls',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
