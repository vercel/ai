import { describe, it, expect } from 'vitest';
import { prepareTools } from './mistral-prepare-tools';

describe('prepareTools', () => {
  const tools = [
    {
      type: 'function' as const,
      name: 'weather',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      type: 'function' as const,
      name: 'attractions',
      inputSchema: { type: 'object', properties: {} },
    },
  ];

  it.each([
    ['auto', 'auto'],
    ['none', 'none'],
    ['required', 'any'],
  ] as const)('maps %s tool choice to %s', (type, expected) => {
    const result = prepareTools({ tools, toolChoice: { type } });

    expect(result.toolChoice).toBe(expected);
    expect(result.tools?.map(tool => tool.function.name)).toEqual([
      'weather',
      'attractions',
    ]);
    expect(result.toolWarnings).toEqual([]);
  });

  it('selects a specific function without removing the other tools', () => {
    const result = prepareTools({
      tools,
      toolChoice: { type: 'tool', toolName: 'weather' },
    });

    expect(result.toolChoice).toEqual({
      type: 'function',
      function: { name: 'weather' },
    });
    expect(result.tools?.map(tool => tool.function.name)).toEqual([
      'weather',
      'attractions',
    ]);
    expect(result.toolWarnings).toEqual([]);
  });

  it('should pass through strict mode when strict is true', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          inputSchema: { type: 'object', properties: {} },
          strict: true,
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": [
          {
            "function": {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": true,
            },
            "type": "function",
          },
        ],
      }
    `);
  });

  it('should pass through strict mode when strict is false', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          inputSchema: { type: 'object', properties: {} },
          strict: false,
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": [
          {
            "function": {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": false,
            },
            "type": "function",
          },
        ],
      }
    `);
  });

  it('should not include strict mode when strict is undefined', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": [
          {
            "function": {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {},
                "type": "object",
              },
            },
            "type": "function",
          },
        ],
      }
    `);
  });

  it('should pass through strict mode for multiple tools with different strict settings', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'strictTool',
          description: 'A strict tool',
          inputSchema: { type: 'object', properties: {} },
          strict: true,
        },
        {
          type: 'function',
          name: 'nonStrictTool',
          description: 'A non-strict tool',
          inputSchema: { type: 'object', properties: {} },
          strict: false,
        },
        {
          type: 'function',
          name: 'defaultTool',
          description: 'A tool without strict setting',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": [
          {
            "function": {
              "description": "A strict tool",
              "name": "strictTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": true,
            },
            "type": "function",
          },
          {
            "function": {
              "description": "A non-strict tool",
              "name": "nonStrictTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": false,
            },
            "type": "function",
          },
          {
            "function": {
              "description": "A tool without strict setting",
              "name": "defaultTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
            },
            "type": "function",
          },
        ],
      }
    `);
  });
});
