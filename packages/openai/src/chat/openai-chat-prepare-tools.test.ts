import { prepareChatTools } from './openai-chat-prepare-tools';
import { it, expect } from 'vitest';

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
