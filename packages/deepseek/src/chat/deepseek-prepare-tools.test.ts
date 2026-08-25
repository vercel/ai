import { describe, it, expect } from 'vitest';
import { prepareTools } from './deepseek-prepare-tools';

describe('prepareTools', () => {
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

  it('should reject strict tools when the endpoint does not support them', () => {
    expect(() =>
      prepareTools({
        tools: [
          {
            type: 'function',
            name: 'strictTool',
            inputSchema: { type: 'object', properties: {} },
            strict: true,
          },
        ],
        supportsStrictToolCalls: false,
      }),
    ).toThrow(
      'DeepSeek strict tool calls require a beta base URL ending in `/beta`.',
    );
  });

  it('should reject mixed strict and non-strict tools on the beta endpoint', () => {
    expect(() =>
      prepareTools({
        tools: [
          {
            type: 'function',
            name: 'strictTool',
            inputSchema: { type: 'object', properties: {} },
            strict: true,
          },
          {
            type: 'function',
            name: 'nonStrictTool',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        supportsStrictToolCalls: true,
      }),
    ).toThrow(
      'DeepSeek strict mode requires every function tool in the request to set `strict: true`.',
    );
  });

  it('should accept all-strict tools on the beta endpoint', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'firstStrictTool',
          inputSchema: { type: 'object', properties: {} },
          strict: true,
        },
        {
          type: 'function',
          name: 'secondStrictTool',
          inputSchema: { type: 'object', properties: {} },
          strict: true,
        },
      ],
      supportsStrictToolCalls: true,
    });

    expect(result.tools?.every(tool => tool.function.strict === true)).toBe(
      true,
    );
  });
});
