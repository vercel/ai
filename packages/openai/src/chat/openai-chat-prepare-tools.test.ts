import { describe, expect, it } from 'vitest';
import { prepareChatTools } from './openai-chat-prepare-tools';

describe('prepareChatTools', () => {
  it('should return undefined tools and toolChoice when tools are null', () => {
    const result = prepareChatTools({
      tools: undefined,
    });

    expect(result).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('should return undefined tools and toolChoice when tools are empty', () => {
    const result = prepareChatTools({
      tools: [],
    });

    expect(result).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('should correctly prepare function tools', () => {
    const result = prepareChatTools({
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

  it('should add warnings for unsupported tools', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'provider',
          id: 'openai.unsupported_tool',
          name: 'unsupported_tool',
          args: {},
        },
      ],
    });

    expect(result.tools).toEqual([]);
    expect(result.toolChoice).toBeUndefined();
    expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "feature": "tool type: provider",
        "type": "unsupported",
      },
    ]
  `);
  });

  it('should handle tool choice "auto"', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      toolChoice: { type: 'auto' },
    });
    expect(result.toolChoice).toEqual('auto');
  });

  it('should handle tool choice "required"', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      toolChoice: { type: 'required' },
    });
    expect(result.toolChoice).toEqual('required');
  });

  it('should handle tool choice "none"', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      toolChoice: { type: 'none' },
    });
    expect(result.toolChoice).toEqual('none');
  });

  it('should handle tool choice "tool"', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
        },
      ],
      toolChoice: { type: 'tool', toolName: 'testFunction' },
    });
    expect(result.toolChoice).toEqual({
      type: 'function',
      function: { name: 'testFunction' },
    });
  });

  it('should pass through strict mode when strict is true', () => {
    const result = prepareChatTools({
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
    const result = prepareChatTools({
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
    const result = prepareChatTools({
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

  it('should append tool_search when toolSearch is true', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      toolSearch: true,
    });

    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'testFunction',
          description: 'A test function',
          parameters: { type: 'object', properties: {} },
        },
      },
      { type: 'tool_search' },
    ]);
    expect(result.toolWarnings).toEqual([]);
  });

  it('should send tool_search even when no regular tools are provided', () => {
    const result = prepareChatTools({
      tools: undefined,
      toolSearch: true,
    });

    expect(result.tools).toEqual([{ type: 'tool_search' }]);
    expect(result.toolWarnings).toEqual([]);
  });

  it('should send tool_search even when tools array is empty', () => {
    const result = prepareChatTools({
      tools: [],
      toolSearch: true,
    });

    expect(result.tools).toEqual([{ type: 'tool_search' }]);
    expect(result.toolWarnings).toEqual([]);
  });

  it('should not append tool_search when toolSearch is false', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      toolSearch: false,
    });

    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'testFunction',
          description: 'A test function',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  it('should set defer_loading on function tools with providerOptions', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'deferredTool',
          description: 'A deferred tool',
          inputSchema: { type: 'object', properties: {} },
          providerOptions: {
            openai: { deferLoading: true },
          },
        },
        {
          type: 'function',
          name: 'normalTool',
          description: 'A normal tool',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });

    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'deferredTool',
          description: 'A deferred tool',
          parameters: { type: 'object', properties: {} },
        },
        defer_loading: true,
      },
      {
        type: 'function',
        function: {
          name: 'normalTool',
          description: 'A normal tool',
          parameters: { type: 'object', properties: {} },
        },
      },
    ]);
  });

  it('should combine toolSearch and deferLoading', () => {
    const result = prepareChatTools({
      tools: [
        {
          type: 'function',
          name: 'deferredTool',
          description: 'A deferred tool',
          inputSchema: { type: 'object', properties: {} },
          providerOptions: {
            openai: { deferLoading: true },
          },
        },
      ],
      toolSearch: true,
    });

    expect(result.tools).toEqual([
      {
        type: 'function',
        function: {
          name: 'deferredTool',
          description: 'A deferred tool',
          parameters: { type: 'object', properties: {} },
        },
        defer_loading: true,
      },
      { type: 'tool_search' },
    ]);
  });

  it('should pass through strict mode for multiple tools with different strict settings', () => {
    const result = prepareChatTools({
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
