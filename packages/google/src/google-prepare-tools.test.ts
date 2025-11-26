import { LanguageModelV3ProviderDefinedTool } from '@ai-sdk/provider';
import { expect, it, describe } from 'vitest';
import { prepareTools } from './google-prepare-tools';

it('should return undefined tools and tool_choice when tools are null', () => {
  const result = prepareTools({
    tools: undefined,
    modelId: 'gemini-2.5-flash',
  });
  expect(result).toEqual({
    tools: undefined,
    tool_choice: undefined,
    toolWarnings: [],
  });
});

it('should return undefined tools and tool_choice when tools are empty', () => {
  const result = prepareTools({ tools: [], modelId: 'gemini-2.5-flash' });
  expect(result).toEqual({
    tools: undefined,
    tool_choice: undefined,
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
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([
    {
      functionDeclarations: [
        {
          name: 'testFunction',
          description: 'A test function',
          parameters: undefined,
        },
      ],
    },
  ]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should correctly prepare provider-defined tools as array', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
      {
        type: 'provider-defined',
        id: 'google.url_context',
        name: 'url_context',
        args: {},
      },
      {
        type: 'provider-defined',
        id: 'google.file_search',
        name: 'file_search',
        args: { fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'] },
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([
    { googleSearch: {} },
    { urlContext: {} },
    {
      fileSearch: {
        fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'],
      },
    },
  ]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should correctly prepare single provider-defined tool', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([{ googleSearch: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should add warnings for unsupported tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'unsupported.tool',
        name: 'unsupported_tool',
        args: {},
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toBeUndefined();
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "feature": "provider-defined tool unsupported.tool",
        "type": "unsupported",
      },
    ]
  `);
});

it('should add warnings for file search on unsupported models', () => {
  const tool: LanguageModelV3ProviderDefinedTool = {
    type: 'provider-defined' as const,
    id: 'google.file_search',
    name: 'file_search',
    args: { fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'] },
  };

  const result = prepareTools({
    tools: [tool],
    modelId: 'gemini-2.0-flash-lite',
  });

  expect(result.tools).toBeUndefined();
  expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "details": "The file search tool is not supported on the following models: gemini-2.0-flash-lite, gemini-2.0-flash, gemini-2.0-flash-001, gemini-2.0-flash-exp, gemini-2.0-flash-live-001, gemini-2.5-flash-image-preview. Current model: gemini-2.0-flash-lite",
        "feature": "provider-defined tool google.file_search",
        "type": "unsupported",
      },
    ]
  `);
});

it('should correctly prepare file search tool', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.file_search',
        name: 'file_search',
        args: {
          fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'],
          metadataFilter: 'author=Robert Graves',
          topK: 5,
        },
      },
    ],
    modelId: 'gemini-2.5-pro',
  });

  expect(result.tools).toEqual([
    {
      fileSearch: {
        fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'],
        metadataFilter: 'author=Robert Graves',
        topK: 5,
      },
    },
  ]);
  expect(result.toolWarnings).toEqual([]);
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
    modelId: 'gemini-2.5-flash',
  });
  expect(result.toolConfig).toEqual({
    functionCallingConfig: { mode: 'AUTO' },
  });
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
    modelId: 'gemini-2.5-flash',
  });
  expect(result.toolConfig).toEqual({
    functionCallingConfig: { mode: 'ANY' },
  });
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
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([
    {
      functionDeclarations: [
        {
          name: 'testFunction',
          description: 'Test',
          parameters: {},
        },
      ],
    },
  ]);
  expect(result.toolConfig).toEqual({
    functionCallingConfig: { mode: 'NONE' },
  });
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
    modelId: 'gemini-2.5-flash',
  });
  expect(result.toolConfig).toEqual({
    functionCallingConfig: {
      mode: 'ANY',
      allowedFunctionNames: ['testFunction'],
    },
  });
});

it('should warn when mixing function and provider-defined tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
    ],
    modelId: 'gemini-2.5-flash',
  });

  expect(result.tools).toEqual([{ googleSearch: {} }]);

  expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "feature": "combination of function and provider-defined tools",
        "type": "unsupported",
      },
    ]
  `);

  expect(result.toolConfig).toBeUndefined();
});

it('should handle tool choice with mixed tools (provider-defined tools only)', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
    ],
    toolChoice: { type: 'auto' },
    modelId: 'gemini-2.5-flash',
  });

  expect(result.tools).toEqual([{ googleSearch: {} }]);

  expect(result.toolConfig).toEqual(undefined);

  expect(result.toolWarnings).toMatchInlineSnapshot(`
    [
      {
        "feature": "combination of function and provider-defined tools",
        "type": "unsupported",
      },
    ]
  `);
});

it('should handle latest modelId for provider-defined tools correctly', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
    ],
    modelId: 'gemini-flash-latest',
  });
  expect(result.tools).toEqual([{ googleSearch: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should handle gemini-3 modelId for provider-defined tools correctly', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_search',
        name: 'google_search',
        args: {},
      },
    ],
    modelId: 'gemini-3-pro-preview',
  });
  expect(result.tools).toEqual([{ googleSearch: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should handle code execution tool', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.code_execution',
        name: 'code_execution',
        args: {},
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([{ codeExecution: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should handle url context tool alone', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.url_context',
        name: 'url_context',
        args: {},
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([{ urlContext: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

describe('Warnings for unsupported models', () => {
  it.each([['gemini-2.0-flash-lite'], ['gemini-2.5-flash-image-preview']])(
    'should add warnings for google search grounding on unsupported models',
    async modelId => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
        modelId: modelId,
      });

      expect(result.tools).toBeUndefined();
      expect(result.toolConfig).toBeUndefined();
      expect(result.toolWarnings).toEqual([
        {
          details: `Google search grounding is not supported on the following models: gemini-2.5-flash-image-preview, gemini-2.0-flash-lite. Current model: ${modelId}`,
          feature: 'provider-defined tool google.google_search',
          type: 'unsupported',
        },
      ]);
    },
  );

  it.each([
    ['gemini-2.0-flash-lite'],
    ['gemini-2.0-flash'],
    ['gemini-2.0-flash-001'],
    ['gemini-2.0-flash-exp'],
    ['gemini-2.5-flash-image-preview'],
  ])(
    'should add warnings for URL Context on unsupported models',
    async modelId => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'google.url_context',
            name: 'url_context',
            args: {},
          },
        ],
        modelId: modelId,
      });

      expect(result.tools).toBeUndefined();
      expect(result.toolConfig).toBeUndefined();
      expect(result.toolWarnings).toEqual([
        {
          details: `The URL context tool is not supported on the following models: gemini-2.0-flash-lite, gemini-2.0-flash, gemini-2.0-flash-001, gemini-2.0-flash-exp, gemini-2.5-flash-image-preview. Current model: ${modelId}`,
          feature: 'provider-defined tool google.url_context',
          type: 'unsupported',
        },
      ]);
    },
  );

  it('should add warnings for code execution on unsupported models', async () => {
    const result = prepareTools({
      tools: [
        {
          type: 'provider-defined',
          id: 'google.code_execution',
          name: 'code_execution',
          args: {},
        },
      ],
      modelId: 'gemini-2.0-flash-lite',
    });

    expect(result.tools).toBeUndefined();
    expect(result.toolConfig).toBeUndefined();
    expect(result.toolWarnings).toEqual([
      {
        details:
          'The code execution tool is not supported on the following models: gemini-2.0-flash-lite. Current model: gemini-2.0-flash-lite',
        feature: 'provider-defined tool google.code_execution',
        type: 'unsupported',
      },
    ]);
  });

  it.each([
    ['gemini-2.0-flash-lite'],
    ['gemini-2.0-flash'],
    ['gemini-2.0-flash-001'],
    ['gemini-2.0-flash-exp'],
    ['gemini-2.0-flash-live-001'],
    ['gemini-2.5-flash-image-preview'],
  ])(
    'should add warnings for file search on unsupported models',
    async modelId => {
      const tool: LanguageModelV3ProviderDefinedTool = {
        type: 'provider-defined' as const,
        id: 'google.file_search',
        name: 'file_search',
        args: { fileSearchStoreNames: ['projects/foo/fileSearchStores/bar'] },
      };

      const result = prepareTools({
        tools: [tool],
        modelId: modelId,
      });

      expect(result.tools).toBeUndefined();
      expect(result.toolWarnings).toEqual([
        {
          details: `The file search tool is not supported on the following models: gemini-2.0-flash-lite, gemini-2.0-flash, gemini-2.0-flash-001, gemini-2.0-flash-exp, gemini-2.0-flash-live-001, gemini-2.5-flash-image-preview. Current model: ${modelId}`,
          feature: 'provider-defined tool google.file_search',
          type: 'unsupported',
        },
      ]);
    },
  );
});
