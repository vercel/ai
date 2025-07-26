import { prepareTools } from './bedrock-prepare-tools';

describe('Anthropic Provider-Defined Tools', () => {
  it('should correctly prepare a single Anthropic provider-defined tool and extract the beta flag', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'provider-defined',
          id: 'anthropic.computer_20241022',
          name: 'computer',
          args: {
            displayWidthPx: 1024,
            displayHeightPx: 768,
            displayNumber: 0,
          },
        },
      ],
    });

    expect(result.toolConfig.tools).toBeUndefined();
    expect(result.anthropicTools).toEqual([
      {
        name: 'computer',
        type: 'computer_20241022',
        display_width_px: 1024,
        display_height_px: 768,
        display_number: 0,
      },
    ]);
    expect(result.betas).toEqual(new Set(['computer-use-2024-10-22']));
    expect(result.toolWarnings).toEqual([]);
  });

  it('should correctly prepare the bash tool with the mismatched ID', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'provider-defined',
          id: 'anthropic.bashTool_20250124',
          name: 'bash',
          args: {},
        },
      ],
    });

    expect(result.toolConfig.tools).toBeUndefined();
    expect(result.anthropicTools).toEqual([
      {
        name: 'bash',
        type: 'bash_20250124',
      },
    ]);
    expect(result.betas).toEqual(new Set(['computer-use-2025-01-24']));
    expect(result.toolWarnings).toEqual([]);
  });

  it('should handle a mix of standard function tools and Anthropic tools', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'get_weather',
          description: 'Get the weather for a location',
          inputSchema: { type: 'object', properties: {} },
        },
        {
          type: 'provider-defined',
          id: 'anthropic.text_editor_20241022',
          name: 'str_replace_editor',
          args: {},
        },
      ],
    });

    expect(result.toolConfig.tools).toHaveLength(1);
    expect(result.toolConfig.tools).toContainEqual({
      toolSpec: {
        name: 'get_weather',
        description: 'Get the weather for a location',
        inputSchema: { json: { type: 'object', properties: {} } },
      },
    });
    expect(result.anthropicTools).toHaveLength(1);
    expect(result.anthropicTools).toContainEqual({
      name: 'str_replace_editor',
      type: 'text_editor_20241022',
    });
    expect(result.betas).toEqual(new Set(['computer-use-2024-10-22']));
    expect(result.toolWarnings).toEqual([]);
  });

  it('should collect beta flags from multiple different Anthropic tools', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'provider-defined',
          id: 'anthropic.computer_20241022',
          name: 'computer',
          args: {},
        },
        {
          type: 'provider-defined',
          id: 'anthropic.bashTool_20250124',
          name: 'bash',
          args: {},
        },
      ],
    });

    expect(result.betas).toEqual(
      new Set(['computer-use-2024-10-22', 'computer-use-2025-01-24']),
    );
  });
});
