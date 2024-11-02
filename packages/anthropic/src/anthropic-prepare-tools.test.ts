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
