import { z } from 'zod/v4';
import { tool, type Tool } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { prepareTools } from './prepare-tools';

const mockTools = {
  tool1: tool({
    description: 'Tool 1 description',
    inputSchema: z.object({}),
  }),
  tool2: tool({
    description: 'Tool 2 description',
    inputSchema: z.object({ city: z.string() }),
  }),
};

const mockProviderDefinedTool: Tool = {
  type: 'provider',
  id: 'provider.tool-id',
  isProviderExecuted: false,
  args: { key: 'value' },
  inputSchema: z.object({}),
};

const mockToolsWithProviderDefined = {
  ...mockTools,
  providerTool: mockProviderDefinedTool,
};

describe('prepareTools', () => {
  it('returns undefined when tools are not provided', async () => {
    const result = await prepareTools({ tools: undefined });

    expect(result).toBeUndefined();
  });

  it('returns all tools', async () => {
    const result = await prepareTools({ tools: mockTools });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "description": "Tool 1 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {},
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": undefined,
          "type": "function",
        },
        {
          "description": "Tool 2 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "city": {
                "type": "string",
              },
            },
            "required": [
              "city",
            ],
            "type": "object",
          },
          "name": "tool2",
          "providerOptions": undefined,
          "type": "function",
        },
      ]
    `);
  });

  it('handles provider-defined tools', async () => {
    const result = await prepareTools({ tools: mockToolsWithProviderDefined });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "description": "Tool 1 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {},
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": undefined,
          "type": "function",
        },
        {
          "description": "Tool 2 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "city": {
                "type": "string",
              },
            },
            "required": [
              "city",
            ],
            "type": "object",
          },
          "name": "tool2",
          "providerOptions": undefined,
          "type": "function",
        },
        {
          "args": {
            "key": "value",
          },
          "id": "provider.tool-id",
          "name": "providerTool",
          "type": "provider",
        },
      ]
    `);
  });

  it('passes through provider options', async () => {
    const result = await prepareTools({
      tools: {
        tool1: tool({
          description: 'Tool 1 description',
          inputSchema: z.object({}),
          providerOptions: {
            aProvider: {
              aSetting: 'aValue',
            },
          },
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "description": "Tool 1 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {},
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": {
            "aProvider": {
              "aSetting": "aValue",
            },
          },
          "type": "function",
        },
      ]
    `);
  });

  it('passes through strict mode settings', async () => {
    const result = await prepareTools({
      tools: {
        tool1: tool({
          description: 'Tool 1 description',
          inputSchema: z.object({}),
          strict: true,
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "description": "Tool 1 description",
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {},
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": undefined,
          "strict": true,
          "type": "function",
        },
      ]
    `);
  });

  it('passes through input examples', async () => {
    const result = await prepareTools({
      tools: {
        tool1: tool({
          description: 'Tool 1 description',
          inputSchema: z.object({
            city: z.string(),
          }),
          inputExamples: [{ input: { city: 'New York' } }],
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "description": "Tool 1 description",
          "inputExamples": [
            {
              "input": {
                "city": "New York",
              },
            },
          ],
          "inputSchema": {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "additionalProperties": false,
            "properties": {
              "city": {
                "type": "string",
              },
            },
            "required": [
              "city",
            ],
            "type": "object",
          },
          "name": "tool1",
          "providerOptions": undefined,
          "type": "function",
        },
      ]
    `);
  });
});
