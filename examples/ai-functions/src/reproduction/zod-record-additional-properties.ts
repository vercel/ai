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

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function inspectConversion({
  name,
  inputSchema,
  propertyName,
}: {
  name: string;
  inputSchema: z.core.$ZodType;
  propertyName?: string;
}): Promise<boolean> {
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

  return !sameJson(actual, expected) && sameJson(wrapped, expected);
}

async function main() {
  const recordInputSchema = z.object({
    values: z.record(z.string(), z.string()),
  });
  const catchallInputSchema = z
    .object({ known: z.string() })
    .catchall(z.number());

  const changedCases: string[] = [];

  if (
    await inspectConversion({
      name: 'z.record()',
      inputSchema: recordInputSchema,
      propertyName: 'values',
    })
  ) {
    changedCases.push('z.record()');
  }

  if (
    await inspectConversion({
      name: 'object catchall',
      inputSchema: catchallInputSchema,
    })
  ) {
    changedCases.push('object catchall');
  }

  const validationResult = await asSchema(recordInputSchema).validate?.({
    values: { example: 'accepted by Zod' },
  });
  console.log(
    'original Zod validation accepts a populated record:',
    validationResult?.success,
  );

  if (changedCases.length === 2 && validationResult?.success === true) {
    throw new Error(
      'Issue #17871 reproduced: AI SDK erased schema-valued additionalProperties for z.record() and object catchall',
    );
  }

  throw new Error(
    `Issue #17871 not reproduced as reported; changed cases: ${changedCases.join(', ')}`,
  );
}

main();
