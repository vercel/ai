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

  describe('provider-defined tools', () => {
    describe('computer_20241022', () => {
      it('should correctly prepare computer_20241022 tool', () => {
        const result = prepareTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'anthropic.computer_20241022',
              name: 'computer',
              args: {
                displayWidthPx: 800,
                displayHeightPx: 600,
                displayNumber: 1,
              },
            },
          ],
        });

        expect(result).toMatchInlineSnapshot(`
          {
            "betas": Set {
              "computer-use-2024-10-22",
            },
            "toolChoice": undefined,
            "toolWarnings": [],
            "tools": [
              {
                "display_height_px": 600,
                "display_number": 1,
                "display_width_px": 800,
                "name": "computer",
                "type": "computer_20241022",
              },
            ],
          }
        `);
      });
    });

    describe('text_editor_20241022', () => {
      it('should correctly prepare text_editor_20241022 tool', () => {
        const result = prepareTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'anthropic.text_editor_20241022',
              name: 'text_editor',
              args: {},
            },
          ],
        });
        expect(result).toMatchInlineSnapshot(`
          {
            "betas": Set {
              "computer-use-2024-10-22",
            },
            "toolChoice": undefined,
            "toolWarnings": [],
            "tools": [
              {
                "name": "str_replace_editor",
                "type": "text_editor_20241022",
              },
            ],
          }
        `);
      });
    });

    it('should correctly prepare bash_20241022 tool', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.bash_20241022',
            name: 'bash',
            args: {},
          },
        ],
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "betas": Set {
            "computer-use-2024-10-22",
          },
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "name": "bash",
              "type": "bash_20241022",
            },
          ],
        }
      `);
    });

    it('should correctly prepare text_editor_20250728 with max_characters', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.text_editor_20250728',
            name: 'str_replace_based_edit_tool',
            args: { maxCharacters: 10000 },
          },
        ],
      });
      expect(result).toMatchInlineSnapshot(`
        {
          "betas": Set {},
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "max_characters": 10000,
              "name": "str_replace_based_edit_tool",
              "type": "text_editor_20250728",
            },
          ],
        }
      `);
    });

    it('should correctly prepare text_editor_20250728 without max_characters', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.text_editor_20250728',
            name: 'str_replace_based_edit_tool',
            args: {},
          },
        ],
      });
      expect(result).toMatchInlineSnapshot(`
        {
          "betas": Set {},
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "max_characters": undefined,
              "name": "str_replace_based_edit_tool",
              "type": "text_editor_20250728",
            },
          ],
        }
      `);
    });

    it('should correctly prepare web_search_20250305', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.web_search_20250305',
            name: 'web_search',
            args: {
              maxUses: 10,
              allowedDomains: ['https://www.google.com'],
              userLocation: { type: 'approximate', city: 'New York' },
            },
          },
        ],
      });
      expect(result).toMatchInlineSnapshot(`
        {
          "betas": Set {},
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "allowed_domains": [
                "https://www.google.com",
              ],
              "blocked_domains": undefined,
              "max_uses": 10,
              "name": "web_search",
              "type": "web_search_20250305",
              "user_location": {
                "city": "New York",
                "type": "approximate",
              },
            },
          ],
        }
      `);
    });

    it('should correctly prepare web_fetch_20250910', () => {
      const result = prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.web_fetch_20250910',
            name: 'web_fetch',
            args: {
              maxUses: 10,
              allowedDomains: ['https://www.google.com'],
              citations: { enabled: true },
              maxContentTokens: 1000,
            },
          },
        ],
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "betas": Set {
            "web-fetch-2025-09-10",
          },
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "allowed_domains": [
                "https://www.google.com",
              ],
              "blocked_domains": undefined,
              "citations": {
                "enabled": true,
              },
              "max_content_tokens": 1000,
              "max_uses": 10,
              "name": "web_fetch",
              "type": "web_fetch_20250910",
            },
          ],
        }
      `);
    });
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
});
