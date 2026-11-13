import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import { asSchema } from '../schema';
import { safeValidateTypes } from '../validate-types';
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

  it('accepts plain objects and strips their keys when inputSchema is omitted', async () => {
    const aTool = tool({ execute: async () => 'ok' });
    const schema = asSchema(aTool.inputSchema);

    expect(await safeValidateTypes({ value: {}, schema })).toMatchObject({
      success: true,
      value: {},
    });
    expect(
      await safeValidateTypes({ value: { unexpected: 1 }, schema }),
    ).toMatchObject({ success: true, value: {} });
  });

  it.each([null, 42, 'text', true, []])(
    'rejects %j when inputSchema is omitted',
    async value => {
      const aTool = tool({ execute: async () => 'ok' });

      expect(
        await safeValidateTypes({ value, schema: asSchema(aTool.inputSchema) }),
      ).toMatchObject({ success: false });
    },
  );

  it('keeps prototype methods of class-based tools that omit inputSchema', async () => {
    class TimeTool {
      readonly #time = '12:00';
      description = 'Get the current time';

      async execute() {
        return this.#time;
      }
    }

    const instance = new TimeTool();
    const aTool = tool(instance);

    expect(aTool).toBe(instance);
    expect(aTool.inputSchema).toBeDefined();
    expect(
      await aTool.execute({}, { toolCallId: '1', messages: [], context: {} }),
    ).toBe('12:00');
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
