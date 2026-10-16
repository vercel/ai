import { describe, it, expect } from 'vitest';
import { prepareTools } from './siliconflow-prepare-tools';

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

  it('should return undefined when tools are empty', () => {
    const result = prepareTools({ tools: [] });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": undefined,
      }
    `);
  });

  it('should return undefined when tools are undefined', () => {
    const result = prepareTools({ tools: undefined });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": undefined,
      }
    `);
  });

  it('should warn about provider-defined tools', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'provider',
          id: 'my-tool',
          args: {},
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [
          {
            "feature": "provider-defined tool my-tool",
            "type": "unsupported",
          },
        ],
        "tools": [],
      }
    `);
  });

  describe('toolChoice', () => {
    it('should handle auto', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'auto' },
      });

      expect(result.toolChoice).toBe('auto');
    });

    it('should handle none', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'none' },
      });

      expect(result.toolChoice).toBe('none');
    });

    it('should handle required', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'required' },
      });

      expect(result.toolChoice).toBe('required');
    });

    it('should handle specific tool', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'tool', toolName: 'testFunction' },
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": {
            "function": {
              "name": "testFunction",
            },
            "type": "function",
          },
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
  });
});
