import { z } from 'zod/v4';
import { prepareToolsAndToolChoice } from './prepare-tools-and-tool-choice';
import { Tool, tool } from '@ai-sdk/provider-utils';
import { describe, it, expect } from 'vitest';

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

const mockProviderTool: Tool = {
  type: 'provider',
  id: 'provider.tool-id',
  args: { key: 'value' },
  inputSchema: z.object({}),
};

const mockToolsWithProviderDefined = {
  ...mockTools,
  providerTool: mockProviderTool,
};

describe('prepareToolsAndToolChoice', () => {
  it('should return undefined for both tools and toolChoice when tools is not provided', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: undefined,
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "tools": undefined,
      }
    `);
  });

  it('should return all tools when activeTools is not provided', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should filter tools based on activeTools', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: undefined,
      activeTools: ['tool1'],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should handle string toolChoice', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: 'none',
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "none",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should handle object toolChoice', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: { type: 'tool', toolName: 'tool2' },
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "toolName": "tool2",
          "type": "tool",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should correctly map tool properties', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockTools,
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should handle provider-defined tool type', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: mockToolsWithProviderDefined,
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should pass through provider options', async () => {
    const result = await prepareToolsAndToolChoice({
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
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should pass through strict mode setting', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: {
        tool1: tool({
          description: 'Tool 1 description',
          inputSchema: z.object({}),
          strict: true,
        }),
      },
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });

  it('should pass through input examples', async () => {
    const result = await prepareToolsAndToolChoice({
      tools: {
        tool1: tool({
          description: 'Tool 1 description',
          inputSchema: z.object({
            city: z.string(),
          }),
          inputExamples: [{ input: { city: 'New York' } }],
        }),
      },
      toolChoice: undefined,
      activeTools: undefined,
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": {
          "type": "auto",
        },
        "tools": [
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
        ],
      }
    `);
  });
});
