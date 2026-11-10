import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod/v4';
import {
  assistantModelMessageSchema,
  modelMessageSchema,
  systemModelMessageSchema,
  toolModelMessageSchema,
  userModelMessageSchema,
} from './message';

describe('public message schemas', () => {
  it.each([
    ['model', modelMessageSchema],
    ['system', systemModelMessageSchema],
    ['user', userModelMessageSchema],
    ['assistant', assistantModelMessageSchema],
    ['tool', toolModelMessageSchema],
  ] as const)('preserves the classic Zod surface for %s', (_, schema) => {
    expect(schema.optional().safeParse(undefined).success).toBe(true);
    expect(schema.nullable().safeParse(null).success).toBe(true);
    expect(schema.array().safeParse([]).success).toBe(true);
    expect(schema.describe('Message').description).toBe('Message');

    const result = schema.safeParse(undefined);
    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error('Expected validation to fail');
    }
    expect(result.error).toBeInstanceOf(ZodError);
    expect(typeof result.error.flatten).toBe('function');
    expect(typeof result.error.format).toBe('function');
  });
});
