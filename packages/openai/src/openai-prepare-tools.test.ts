import { prepareTools } from './openai-prepare-tools';

it('should return undefined tools and toolChoice when tools are null', () => {
  const result = prepareTools({
    tools: undefined,
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result).toEqual({
    tools: undefined,
    toolChoice: undefined,
    toolWarnings: [],
  });
});

it('should return undefined tools and toolChoice when tools are empty', () => {
  const result = prepareTools({
    tools: [],
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result).toEqual({
    tools: undefined,
    toolChoice: undefined,
    toolWarnings: [],
  });
});

it('should correctly prepare function tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result.tools).toEqual([
    {
      type: 'function',
      function: {
        name: 'testFunction',
        description: 'A test function',
        parameters: { type: 'object', properties: {} },
        strict: undefined,
      },
    },
  ]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should correctly prepare provider-defined-server tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'openai.file_search',
        name: 'file_search',
        args: {
          vectorStoreIds: ['vs_123'],
          maxNumResults: 10,
          ranking: {
            ranker: 'semantic',
          },
        },
      },
      {
        type: 'provider-defined',
        id: 'openai.web_search_preview',
        name: 'web_search_preview',
        args: {
          searchContextSize: 'high',
          userLocation: {
            type: 'approximate',
            city: 'San Francisco',
            region: 'CA',
          },
        },
      },
    ],
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result.tools).toEqual([
    {
      type: 'file_search',
      vector_store_ids: ['vs_123'],
      max_num_results: 10,
      ranking_options: {
        ranker: 'semantic',
      },
    },
    {
      type: 'web_search_preview',
      search_context_size: 'high',
      user_location: {
        type: 'approximate',
        city: 'San Francisco',
        region: 'CA',
      },
    },
  ]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should add warnings for unsupported tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'openai.unsupported_tool',
        name: 'unsupported_tool',
        args: {},
      },
    ],
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result.tools).toEqual([]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "tool": {
          "args": {},
          "id": "openai.unsupported_tool",
          "name": "unsupported_tool",
          "type": "provider-defined",
        },
        "type": "unsupported-tool",
      },
    ]
  `);
});

it('should add warnings for unsupported provider-defined tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'some.client_tool',
        name: 'clientTool',
        args: {},
      } as any,
    ],
    structuredOutputs: false,
    strictJsonSchema: false,
  });

  expect(result.tools).toEqual([]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'provider-defined',
        id: 'some.client_tool',
        name: 'clientTool',
        args: {},
      },
    },
  ]);
});

it('should handle tool choice "auto"', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'auto' },
    structuredOutputs: false,
    strictJsonSchema: false,
  });
  expect(result.toolChoice).toEqual('auto');
});

it('should handle tool choice "required"', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'required' },
    structuredOutputs: false,
    strictJsonSchema: false,
  });
  expect(result.toolChoice).toEqual('required');
});

it('should handle tool choice "none"', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'none' },
    structuredOutputs: false,
    strictJsonSchema: false,
  });
  expect(result.toolChoice).toEqual('none');
});

it('should handle tool choice "tool"', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        inputSchema: {},
      },
    ],
    toolChoice: { type: 'tool', toolName: 'testFunction' },
    structuredOutputs: false,
    strictJsonSchema: false,
  });
  expect(result.toolChoice).toEqual({
    type: 'function',
    function: { name: 'testFunction' },
  });
});
