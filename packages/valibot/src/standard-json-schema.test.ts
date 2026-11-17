import { asSchema, safeValidateTypes } from '@ai-sdk/provider-utils';
import { toStandardJsonSchema } from '@valibot/to-json-schema';
import { describe, expect, it } from 'vitest';
import * as v from 'valibot';

// Valibot's `~standard.validate` returns `{ value, typed, issues }` for an
// invalid value. This schema therefore checks the Standard Schema adapter
// against the real library, which a mocked Standard Schema cannot guarantee.
const readDocSchema = toStandardJsonSchema(
  v.object({
    collection: v.literal('public'),
    docId: v.string(),
    limit: v.pipe(v.number(), v.minValue(1), v.maxValue(5)),
  }),
);

const validValue = { collection: 'public', docId: 'faq', limit: 1 };
const invalidValue = {
  collection: 'internal',
  docId: 'payroll-2026',
  limit: 999999,
};

describe('Standard JSON Schema validation', () => {
  it('should accept a value that matches the schema', async () => {
    await expect(
      asSchema(readDocSchema).validate!(validValue),
    ).resolves.toEqual({ success: true, value: validValue });
  });

  it('should reject a value that does not match the schema', async () => {
    const result = await asSchema(readDocSchema).validate!(invalidValue);

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected validation to fail');
    }
    // `@ai-sdk/valibot` does not depend on `@ai-sdk/provider`, so identify the
    // error by the name and value that TypeValidationError exposes.
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error).toMatchObject({ value: invalidValue });
  });

  it('should reach the same verdicts through safeValidateTypes', async () => {
    await expect(
      safeValidateTypes({ value: validValue, schema: readDocSchema }),
    ).resolves.toMatchObject({ success: true, value: validValue });

    const result = await safeValidateTypes({
      value: invalidValue,
      schema: readDocSchema,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected validation to fail');
    }
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error).toMatchObject({ value: invalidValue });
  });
});
