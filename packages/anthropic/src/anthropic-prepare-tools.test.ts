import { describe, it, expect } from 'vitest';
import { prepareTools } from './anthropic-prepare-tools';

describe('prepareTools', () => {
  it('should return undefined tools and tool_choice when tools are null', () => {
    const result = prepareTools({ tools: undefined });
    expect(result).toEqual({
      tools: undefined,
      tool_choice: undefined,
      toolWarnings: [],
      betas: new Set(),
    });
  });

  it('should return undefined tools and tool_choice when tools are empty', () => {
    const result = prepareTools({ tools: [] });
    expect(result).toEqual({
      tools: undefined,
      tool_choice: undefined,
      toolWarnings: [],
      betas: new Set(),
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
    });
    expect(result.tools).toEqual([
      {
        name: 'testFunction',
        description: 'A test function',
        input_schema: { type: 'object', properties: {} },
      },
    ]);
    expect(result.toolChoice).toBeUndefined();
    expect(result.toolWarnings).toEqual([]);
  });

  it('should correctly prepare provider-defined tools', () => {
    const result = prepareTools({
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
        name: 'str_replace_editor',
        type: 'text_editor_20241022',
      },
      {
        name: 'bash',
        type: 'bash_20241022',
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
          id: 'unsupported.tool',
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
    });
    expect(result.toolChoice).toEqual({ type: 'auto' });
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
    });
    expect(result.toolChoice).toEqual({ type: 'any' });
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
    });
    expect(result.tools).toBeUndefined();
    expect(result.toolChoice).toBeUndefined();
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
    });
    expect(result.toolChoice).toEqual({ type: 'tool', name: 'testFunction' });
  });

  it('should set cache control', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'function',
          name: 'testFunction',
          description: 'Test',
          inputSchema: {},
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      ],
    });

    expect(result.tools).toMatchInlineSnapshot(`
      [
        {
          "cache_control": {
            "type": "ephemeral",
          },
          "description": "Test",
          "input_schema": {},
          "name": "testFunction",
        },
      ]
    `);
  });

  it('should handle direct web_fetch tool object', () => {
    const result = prepareTools({
      tools: [
        {
          type: 'web_fetch_20250910',
          name: 'web_fetch',
          max_uses: 3,
          allowed_domains: ['example.com'],
        } as any,
      ],
    });

    expect(result.tools).toEqual([
      {
        type: 'web_fetch_20250910',
        name: 'web_fetch',
        max_uses: 3,
        allowed_domains: ['example.com'],
      },
    ]);
    expect(result.betas.size).toBe(1);
    expect(result.betas.has('web-fetch-2025-09-10')).toBe(true);
  });
});
