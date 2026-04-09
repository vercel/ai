import { z } from 'zod/v4';
import { describe, expect, it } from 'vitest';
import { tool } from './tool';

describe('tool()', () => {
  it('passes through tool with inputSchema unchanged', () => {
    const schema = z.object({ query: z.string() });
    const result = tool({
      description: 'test tool',
      inputSchema: schema,
      execute: async () => 'result',
    });

    expect(result.inputSchema).toBe(schema);
    expect(result.description).toBe('test tool');
  });

  it('normalizes deprecated parameters to inputSchema', () => {
    const schema = z.object({ query: z.string() });
    const result = tool({
      description: 'test tool',
      parameters: schema,
      execute: async () => 'result',
    } as any);

    expect(result.inputSchema).toBe(schema);
    expect(result.description).toBe('test tool');
    expect(result.parameters).toBeUndefined();
  });

  it('prefers inputSchema over parameters when both are present', () => {
    const inputSchema = z.object({ a: z.string() });
    const parameters = z.object({ b: z.number() });
    const result = tool({
      description: 'test tool',
      inputSchema,
      parameters,
      execute: async () => 'result',
    } as any);

    expect(result.inputSchema).toBe(inputSchema);
  });

  it('preserves all other properties when normalizing parameters', () => {
    const schema = z.object({ query: z.string() });
    const execute = async () => 'result';
    const result = tool({
      description: 'a test tool',
      title: 'Test Tool',
      parameters: schema,
      execute,
    } as any);

    expect(result.inputSchema).toBe(schema);
    expect(result.description).toBe('a test tool');
    expect(result.title).toBe('Test Tool');
    expect(result.execute).toBe(execute);
  });
});
