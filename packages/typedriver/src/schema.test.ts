import { describe, it, expect } from 'vitest';
import { schema } from './schema';
import { Schema } from '@ai-sdk/provider-utils';
import { object, number } from 'valibot';
import { type } from 'arktype';
import { z } from 'zod';
import { Type } from 'typebox';
import { toStandardJsonSchema } from '@valibot/to-json-schema';

const validObject = { x: 1, y: 2, z: 3 };
const invalidObject = { x: 'a', y: 2, z: 3 };

// ------------------------------------------------------------------
// IsEqual
// ------------------------------------------------------------------
type TIsEqual<Left extends unknown, Right extends unknown> = (
  <T>() => T extends Left ? 1 : 2) extends (<T>() => T extends Right ? 1 : 2
) ? true : false

export function isEqual<Left extends unknown, Right extends unknown>(_expect: TIsEqual<Left, Right>) {}

// ------------------------------------------------------------------
// TypeScript
// ------------------------------------------------------------------
describe('typescript', () => {
  const T = schema(`{ 
    x: number, 
    y: number, 
    z: number 
  }`);

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };

    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
// ------------------------------------------------------------------
// JsonSchema
// ------------------------------------------------------------------
describe('jsonschema', () => {
  const T = schema({
    type: 'object',
    properties: {
      x: { type: 'number' },
      y: { type: 'number' },
      z: { type: 'number' },
    },
    required: ['x', 'y', 'z'],
  });

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);;

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };
    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
// ------------------------------------------------------------------
// TypeBox
// ------------------------------------------------------------------
describe('typebox', () => {
  const T = schema(Type.Object({
    x: Type.Number(),
    y: Type.Number(),
    z: Type.Number(),
  }));

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };
    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
// ------------------------------------------------------------------
// Zod
// ------------------------------------------------------------------
describe('zod', () => {
  const T = schema(z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }));

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };
    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
// ------------------------------------------------------------------
// Valibot
// ------------------------------------------------------------------
describe('valibot', () => {
  const T = schema(toStandardJsonSchema(object({
    x: number(),
    y: number(),
    z: number(),
  })));

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };
    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
// ------------------------------------------------------------------
// ArkType
// ------------------------------------------------------------------
describe('arktype', () => {
  const T = schema(type({
    x: 'number',
    y: 'number',
    z: 'number',
  }));

  isEqual<typeof T, Schema<{ 
    x: number, 
    y: number, 
    z: number 
  }>>(true);

  it('should validate valid object', async () => {
    const result = await T.validate!(validObject) as { success: true; value: typeof validObject };
    expect(result.success).toBe(true);
    expect(result.value).toEqual(validObject);
  });

  it('should reject invalid object', async () => {
    const result = await T.validate!(invalidObject) as { success: false; error: Error };
    expect(result.success).toBe(false);
    expect(result.error).instanceOf(Error)
  });
});
