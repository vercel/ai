import { prepareResponsesTools } from './openai-compatible-responses-prepare-tools';
import { describe, it, expect } from 'vitest';

describe('prepareResponsesTools', () => {
  describe('empty tools', () => {
    it('should return undefined for empty tools array', () => {
      const result = prepareResponsesTools({
        tools: [],
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": undefined,
        }
      `);
    });

    it('should return undefined for undefined tools', () => {
      const result = prepareResponsesTools({
        tools: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": undefined,
        }
      `);
    });
  });

  describe('function tools', () => {
    it('should prepare a basic function tool', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should prepare a function tool with strict JSON schema', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        strictJsonSchema: true,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should prepare multiple function tools', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'function1',
            description: 'First function',
            inputSchema: {
              type: 'object',
              properties: {
                input1: { type: 'string' },
              },
            },
          },
          {
            type: 'function',
            name: 'function2',
            description: 'Second function',
            inputSchema: {
              type: 'object',
              properties: {
                input2: { type: 'number' },
              },
            },
          },
        ],
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "First function",
              "name": "function1",
              "parameters": {
                "properties": {
                  "input1": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
            {
              "description": "Second function",
              "name": "function2",
              "parameters": {
                "properties": {
                  "input2": {
                    "type": "number",
                  },
                },
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
          ],
        }
      `);
    });
  });

  describe('tool choice', () => {
    it('should handle auto tool choice', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        toolChoice: { type: 'auto' },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toBe('auto');
      expect(result.tools).toHaveLength(1);
    });

    it('should handle none tool choice', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        toolChoice: { type: 'none' },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toBe('none');
      expect(result.tools).toHaveLength(1);
    });

    it('should handle required tool choice', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        toolChoice: { type: 'required' },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toBe('required');
      expect(result.tools).toHaveLength(1);
    });

    it('should handle specific tool choice', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        toolChoice: { type: 'tool', toolName: 'testFunction' },
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": {
            "name": "testFunction",
            "type": "function",
          },
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should handle undefined tool choice', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toBeUndefined();
      expect(result.tools).toHaveLength(1);
    });
  });
});
