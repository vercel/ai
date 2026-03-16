import { describe, expect, it } from 'vitest';
import { getToolDescriptors } from './get-tool-descriptors';
import { jsonSchema, tool } from '@ai-sdk/provider-utils';

describe('getToolDescriptors', () => {
  it('should return empty array for undefined tools', async () => {
    expect(await getToolDescriptors(undefined)).toEqual([]);
  });

  it('should return empty array for empty tools', async () => {
    expect(await getToolDescriptors({})).toEqual([]);
  });

  it('should extract descriptor from a function tool', async () => {
    const tools = {
      search: tool({
        description: 'Search the web',
        parameters: jsonSchema({
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        }),
        execute: async () => 'result',
      }),
    };

    const descriptors = await getToolDescriptors(tools);

    expect(descriptors).toHaveLength(1);
    expect(descriptors[0]).toMatchObject({
      type: 'function',
      name: 'search',
      description: 'Search the web',
    });
    expect(descriptors[0].inputSchema).toBeDefined();
    expect(descriptors[0]).not.toHaveProperty('execute');
  });

  it('should not include execute function in descriptors', async () => {
    const tools = {
      myTool: tool({
        description: 'A tool',
        parameters: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => 'should not appear',
      }),
    };

    const descriptors = await getToolDescriptors(tools);
    const descriptor = descriptors[0];

    expect(descriptor).not.toHaveProperty('execute');
    expect(Object.keys(descriptor)).toEqual([
      'type',
      'name',
      'description',
      'inputSchema',
      'providerOptions',
    ]);
  });

  it('should extract multiple tool descriptors', async () => {
    const tools = {
      search: tool({
        description: 'Search',
        parameters: jsonSchema({ type: 'object', properties: {} }),
        execute: async () => 'search result',
      }),
      calculate: tool({
        description: 'Calculate',
        parameters: jsonSchema({
          type: 'object',
          properties: { expression: { type: 'string' } },
        }),
        execute: async () => 42,
      }),
    };

    const descriptors = await getToolDescriptors(tools);

    expect(descriptors).toHaveLength(2);
    expect(descriptors.map(d => d.name)).toEqual(['search', 'calculate']);
  });
});
