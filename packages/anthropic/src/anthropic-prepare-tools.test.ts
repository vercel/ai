import { prepareTools } from './anthropic-prepare-tools';

it('should return undefined tools and tool_choice when tools are null', () => {
  const result = prepareTools({ type: 'regular', tools: undefined });
  expect(result).toEqual({
    tools: undefined,
    tool_choice: undefined,
    toolWarnings: [],
    betas: new Set(),
  });
});

it('should return undefined tools and tool_choice when tools are empty', () => {
  const result = prepareTools({ type: 'regular', tools: [] });
  expect(result).toEqual({
    tools: undefined,
    tool_choice: undefined,
    toolWarnings: [],
    betas: new Set(),
  });
});

it('should correctly prepare function tools', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'A test function',
        parameters: { type: 'object', properties: {} },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'testFunction',
      description: 'A test function',
      input_schema: { type: 'object', properties: {} },
    },
  ]);
  expect(result.tool_choice).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should correctly prepare provider-defined tools', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.computer_20241022',
        name: 'computer',
        args: { displayWidthPx: 800, displayHeightPx: 600, displayNumber: 1 },
      },
      {
        type: 'provider-defined',
        id: 'anthropic.text_editor_20241022',
        name: 'text_editor',
        args: {},
      },
      {
        type: 'provider-defined',
        id: 'anthropic.bash_20241022',
        name: 'bash',
        args: {},
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'computer',
      type: 'computer_20241022',
      display_width_px: 800,
      display_height_px: 600,
      display_number: 1,
    },
    {
      name: 'text_editor',
      type: 'text_editor_20241022',
    },
    {
      name: 'bash',
      type: 'bash_20241022',
    },
  ]);
  expect(result.tool_choice).toBeUndefined();
  expect(result.toolWarnings).toEqual([]);
});

it('should correctly prepare provider-defined web_search tool', () => {
  // Test with basic web_search tool
  let result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: {},
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
    },
  ]);
  expect(result.toolWarnings).toEqual([]);
  expect(result.betas.has('WEB_SEARCH_TOOL_20250305_SUPPORT')).toBe(true); // Assuming a beta flag might be set

  // Test with max_uses
  result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: { max_uses: 3 },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
      max_uses: 3,
    },
  ]);

  // Test with allowed_domains
  result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: { allowed_domains: ['example.com'] },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
      allowed_domains: ['example.com'],
    },
  ]);

  // Test with blocked_domains
  result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: { blocked_domains: ['blocked.com'] },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
      blocked_domains: ['blocked.com'],
    },
  ]);

  // Test with user_location
  const userLocation = {
    type: 'approximate' as const,
    city: 'San Francisco',
    region: 'CA',
    country: 'US',
    timezone: 'America/Los_Angeles',
  };
  result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: { user_location: userLocation },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
      user_location: userLocation,
    },
  ]);

  // Test with all parameters
  result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'anthropic.web_search_20250305',
        name: 'web_search',
        args: {
          max_uses: 5,
          allowed_domains: ['example.com', 'another.org'],
          user_location: userLocation,
        },
      },
    ],
  });
  expect(result.tools).toEqual([
    {
      name: 'web_search',
      type: 'web_search_20250305',
      max_uses: 5,
      allowed_domains: ['example.com', 'another.org'],
      user_location: userLocation,
    },
  ]);
});

it('should add warnings for unsupported tools', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'provider-defined',
        id: 'unsupported.tool',
        name: 'unsupportedProviderTool',
        args: {},
      },
    ],
  });
  expect(result.tools).toEqual([]);
  expect(result.tool_choice).toBeUndefined();
  expect(result.toolWarnings).toEqual([
    {
      type: 'unsupported-tool',
      tool: {
        type: 'provider-defined',
        id: 'unsupported.tool',
        name: 'unsupportedProviderTool',
        args: {},
      },
    },
  ]);
});

it('should handle tool choice "auto"', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        parameters: {},
      },
    ],
    toolChoice: { type: 'auto' },
  });
  expect(result.tool_choice).toEqual({ type: 'auto' });
});

it('should handle tool choice "required"', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        parameters: {},
      },
    ],
    toolChoice: { type: 'required' },
  });
  expect(result.tool_choice).toEqual({ type: 'any' });
});

it('should handle tool choice "none"', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        parameters: {},
      },
    ],
    toolChoice: { type: 'none' },
  });
  expect(result.tools).toBeUndefined();
  expect(result.tool_choice).toBeUndefined();
});

it('should handle tool choice "tool"', () => {
  const result = prepareTools({
    type: 'regular',
    tools: [
      {
        type: 'function',
        name: 'testFunction',
        description: 'Test',
        parameters: {},
      },
    ],
    toolChoice: { type: 'tool', toolName: 'testFunction' },
  });
  expect(result.tool_choice).toEqual({ type: 'tool', name: 'testFunction' });
});
