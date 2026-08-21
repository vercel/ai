import { asSchema, jsonSchema } from 'ai';
import type { JSONSchema7 } from '@ai-sdk/provider';
import * as z from 'zod/v4';

function getPropertyAdditionalProperties(
  schema: JSONSchema7,
  property: string,
): unknown {
  const propertySchema = schema.properties?.[property];

  if (propertySchema == null || typeof propertySchema === 'boolean') {
    throw new Error(`Missing object schema for property "${property}".`);
  }

  return propertySchema.additionalProperties;
}

function format(value: unknown): string {
  return JSON.stringify(value);
}

async function main() {
  const recordSchema = z.object({
    values: z.record(z.string(), z.string()),
  });
  const catchallSchema = z
    .object({
      known: z.string(),
    })
    .catchall(z.number());

  const zodRecordJsonSchema = z.toJSONSchema(recordSchema, {
    target: 'draft-7',
    io: 'input',
  }) as JSONSchema7;
  const convertedRecordJsonSchema = (await asSchema(recordSchema)
    .jsonSchema) as JSONSchema7;
  const wrappedRecordJsonSchema = (await asSchema(
    jsonSchema(zodRecordJsonSchema),
  ).jsonSchema) as JSONSchema7;

  const zodCatchallJsonSchema = z.toJSONSchema(catchallSchema, {
    target: 'draft-7',
    io: 'input',
  }) as JSONSchema7;
  const convertedCatchallJsonSchema = (await asSchema(catchallSchema)
    .jsonSchema) as JSONSchema7;
  const wrappedCatchallJsonSchema = (await asSchema(
    jsonSchema(zodCatchallJsonSchema),
  ).jsonSchema) as JSONSchema7;

  const expectedRecord = getPropertyAdditionalProperties(
    zodRecordJsonSchema,
    'values',
  );
  const actualRecord = getPropertyAdditionalProperties(
    convertedRecordJsonSchema,
    'values',
  );
  const wrappedRecord = getPropertyAdditionalProperties(
    wrappedRecordJsonSchema,
    'values',
  );

  const expectedCatchall = zodCatchallJsonSchema.additionalProperties;
  const actualCatchall = convertedCatchallJsonSchema.additionalProperties;
  const wrappedCatchall = wrappedCatchallJsonSchema.additionalProperties;

  const validation = await asSchema(recordSchema).validate?.({
    values: { populated: 'record' },
  });

  console.log(`z.record Zod JSON Schema: ${format(expectedRecord)}`);
  console.log(`z.record asSchema: ${format(actualRecord)}`);
  console.log(`z.record jsonSchema wrapper: ${format(wrappedRecord)}`);
  console.log(`catchall Zod JSON Schema: ${format(expectedCatchall)}`);
  console.log(`catchall asSchema: ${format(actualCatchall)}`);
  console.log(`catchall jsonSchema wrapper: ${format(wrappedCatchall)}`);
  console.log(`populated record Zod validation: ${validation?.success}`);

  if (format(expectedRecord) !== format({ type: 'string' })) {
    throw new Error('Zod did not produce the expected record value schema.');
  }

  if (format(expectedCatchall) !== format({ type: 'number' })) {
    throw new Error('Zod did not produce the expected catchall value schema.');
  }

  if (
    format(wrappedRecord) !== format(expectedRecord) ||
    format(wrappedCatchall) !== format(expectedCatchall)
  ) {
    throw new Error('The jsonSchema() control path changed the input schema.');
  }

  if (validation?.success !== true) {
    throw new Error('The original Zod schema rejected a populated record.');
  }

  if (
    format(actualRecord) !== format(expectedRecord) ||
    format(actualCatchall) !== format(expectedCatchall)
  ) {
    throw new Error(
      'ISSUE #17871 REPRODUCED: AI SDK changed schema-valued additionalProperties to false',
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
