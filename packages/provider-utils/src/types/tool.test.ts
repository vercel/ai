import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { asSchema } from '../schema';
import { tool } from './tool';

describe('tool helper', () => {
  it('defaults inputSchema to an empty object schema when omitted', async () => {
    const aTool = tool({
      description: 'Get the current time',
      execute: async () => '12:00',
    });

    expect(aTool.inputSchema).toBeDefined();
    expect(await asSchema(aTool.inputSchema).jsonSchema).toStrictEqual({
      type: 'object',
      properties: {},
      additionalProperties: false,
    });
  });

  it('preserves a provided inputSchema', async () => {
    const inputSchema = z.object({ city: z.string() });
    const aTool = tool({
      description: 'Get the weather',
      inputSchema,
    });

    expect(aTool.inputSchema).toBe(inputSchema);
    expect(await asSchema(aTool.inputSchema).jsonSchema).toMatchObject({
      type: 'object',
      properties: {
        city: { type: 'string' },
      },
    });
  });
});
