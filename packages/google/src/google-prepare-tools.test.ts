import { expect, it } from 'vitest';
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
  expect(result.tools).toEqual({
    functionDeclarations: [
      {
        name: 'testFunction',
        description: 'A test function',
        parameters: undefined,
      },
    ],
  });
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
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([{ googleSearch: {} }, { urlContext: {} }]);
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should handle google maps tool with retrieval config', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_maps',
        name: 'google_maps',
        args: {
          enableWidget: true,
          retrievalConfig: {
            latLng: { latitude: 37.78193, longitude: -122.40476 },
          },
        },
      },
    ],
    modelId: 'gemini-2.5-flash',
  });
  expect(result.tools).toEqual([
    { googleMaps: { enableWidget: true } },
  ]);
  expect(result.toolConfig).toEqual({
    retrievalConfig: {
      latLng: { latitude: 37.78193, longitude: -122.40476 },
    },
  });
  expect(result.toolWarnings).toEqual([]);
});

it('should include google maps alongside other provider-defined tools', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_maps',
        name: 'google_maps',
        args: {
          retrievalConfig: {
            latLng: { latitude: 40.758896, longitude: -73.98513 },
          },
        },
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
  expect(result.tools).toEqual([
    { googleMaps: {} },
    { googleSearch: {} },
  ]);
  expect(result.toolConfig).toEqual({
    retrievalConfig: {
      latLng: { latitude: 40.758896, longitude: -73.98513 },
    },
  });
  expect(result.toolWarnings).toEqual([]);
});

it('should warn when google maps tool is used with unsupported model', () => {
  const result = prepareTools({
    tools: [
      {
        type: 'provider-defined',
        id: 'google.google_maps',
        name: 'google_maps',
        args: {},
      },
    ],
    modelId: 'gemini-1.5-flash',
  });
  expect(result.tools).toBeUndefined();
  expect(result.toolConfig).toBeUndefined();
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'provider-defined',
        id: 'google.google_maps',
        name: 'google_maps',
        args: {},
      },
      details:
        'The Google Maps grounding tool is only supported with Gemini 2 models.',
    },
  ]);
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
        "tool": {
          "args": {},
          "id": "unsupported.tool",
          "name": "unsupported_tool",
          "type": "provider-defined",
        },
        "type": "unsupported-tool",
      },
    ]
  `);
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
  expect(result.tools).toEqual({
    functionDeclarations: [
      {
        name: 'testFunction',
        description: 'Test',
        parameters: {},
      },
    ],
  });
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

  // Should only include provider-defined tools as array
  expect(result.tools).toEqual([{ googleSearch: {} }]);

  // Should have warning about mixed tool types
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        inputSchema: { type: 'object', properties: {} },
      },
      details:
        'Cannot mix function tools with provider-defined tools in the same request. Please use either function tools or provider-defined tools, but not both.',
    },
  ]);

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

  // Should only include provider-defined tools as array
  expect(result.tools).toEqual([{ googleSearch: {} }]);

  // Should apply tool choice to provider-defined tools
  expect(result.toolConfig).toEqual(undefined);

  // Should have warning about mixed tool types
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        inputSchema: { type: 'object', properties: {} },
      },
      details:
        'Cannot mix function tools with provider-defined tools in the same request. Please use either function tools or provider-defined tools, but not both.',
    },
  ]);
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
