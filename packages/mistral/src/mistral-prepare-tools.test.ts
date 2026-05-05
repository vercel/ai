import { describe, it, expect } from 'vitest';
import { prepareTools } from './mistral-prepare-tools';

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

  describe('provider-defined tools', () => {
    it('should convert mistral.web_search to { type: "web_search" }', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider',
            id: 'mistral.web_search',
            name: 'web_search',
            args: {},
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {},
          },
        ],
      });

      expect(result.tools).toEqual([{ type: 'web_search' }]);
      expect(result.toolWarnings).toHaveLength(0);
    });

    it('should convert mistral.web_search_premium to { type: "web_search_premium" }', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider',
            id: 'mistral.web_search_premium',
            name: 'web_search_premium',
            args: {},
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {},
          },
        ],
      });

      expect(result.tools).toEqual([{ type: 'web_search_premium' }]);
      expect(result.toolWarnings).toHaveLength(0);
    });

    it('should mix function tools and built-in tools', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'myFunc',
            description: 'A function',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            type: 'provider',
            id: 'mistral.web_search',
            name: 'web_search',
            args: {},
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {},
          },
        ],
      });

      expect(result.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'myFunc',
            description: 'A function',
            parameters: { type: 'object', properties: {} },
          },
        },
        { type: 'web_search' },
      ]);
      expect(result.toolWarnings).toHaveLength(0);
    });

    it('should emit unsupported warning for unknown provider tools', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider',
            id: 'unknown.tool',
            name: 'unknown_tool',
            args: {},
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {},
          },
        ],
      });

      expect(result.tools).toEqual([]);
      expect(result.toolWarnings).toHaveLength(1);
      expect(result.toolWarnings[0]).toMatchObject({
        type: 'unsupported',
        feature: 'provider-defined tool unknown.tool',
      });
    });

    it('should not include built-in tools when filtering by tool choice', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'myFunc',
            description: 'A function',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            type: 'provider',
            id: 'mistral.web_search',
            name: 'web_search',
            args: {},
            inputSchema: { type: 'object', properties: {} },
            outputSchema: {},
          },
        ],
        toolChoice: { type: 'tool', toolName: 'myFunc' },
      });

      expect(result.tools).toEqual([
        {
          type: 'function',
          function: {
            name: 'myFunc',
            description: 'A function',
            parameters: { type: 'object', properties: {} },
          },
        },
      ]);
      expect(result.toolChoice).toBe('any');
    });
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
