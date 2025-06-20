import { prepareTools } from './openai-prepare-tools';
import { fileSearch } from './tool/file-search';
import { webSearchPreview } from './tool/web-search-preview';

it('should return undefined tools and toolChoice when tools are null', () => {
  const result = prepareTools({ tools: undefined, structuredOutputs: false });
  expect(result).toEqual({
    tools: undefined,
    toolChoice: undefined,
    toolWarnings: [],
  });
});

it('should return undefined tools and toolChoice when tools are empty', () => {
  const result = prepareTools({ tools: [], structuredOutputs: false });
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
      fileSearch({
        vectorStoreIds: ['vs_123'],
        maxResults: 10,
        searchType: 'semantic',
      }),
      webSearchPreview({
        searchContextSize: 'high',
        userLocation: {
          type: 'approximate',
          city: 'San Francisco',
          region: 'CA',
        },
      }),
    ],
    structuredOutputs: false,
  });
  expect(result.tools).toEqual([
    {
      type: 'file_search',
      vector_store_ids: ['vs_123'],
      max_results: 10,
      search_type: 'semantic',
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
        type: 'provider-defined-server',
        id: 'openai.unsupported_tool',
        name: 'unsupportedTool',
        args: {},
      },
    ],
    structuredOutputs: false,
  });
  expect(result.tools).toEqual([]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'provider-defined-server',
        id: 'openai.unsupported_tool',
        name: 'unsupportedTool',
        args: {},
      },
    },
  ]);
});

it('should add warnings for unsupported provider-defined-client tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined-client',
        id: 'some.client_tool',
        name: 'clientTool',
        args: {},
      } as any,
    ],
    structuredOutputs: false,
  });
  expect(result.tools).toEqual([]);
  expect(result.toolChoice).toBeUndefined();
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'provider-defined-client',
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
  });
  expect(result.toolChoice).toEqual({
    type: 'function',
    function: { name: 'testFunction' },
  });
});
