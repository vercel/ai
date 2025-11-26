import { describe, it, expect } from 'vitest';
import { prepareTools } from './anthropic-prepare-tools';
import { CacheControlValidator } from './get-cache-control';

describe('prepareTools', () => {
  it('should return undefined tools and tool_choice when tools are null', async () => {
    const result = await prepareTools({ tools: undefined });
    expect(result).toEqual({
      tools: undefined,
      tool_choice: undefined,
      toolWarnings: [],
      betas: new Set(),
    });
  });

  it('should return undefined tools and tool_choice when tools are empty', async () => {
    const result = await prepareTools({ tools: [] });
    expect(result).toEqual({
      tools: undefined,
      tool_choice: undefined,
      toolWarnings: [],
      betas: new Set(),
    });
  });

  it('should correctly prepare function tools', async () => {
    const result = await prepareTools({
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
      it('should correctly prepare computer_20241022 tool', async () => {
        const result = await prepareTools({
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
                "cache_control": undefined,
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
      it('should correctly prepare text_editor_20241022 tool', async () => {
        const result = await prepareTools({
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
                "cache_control": undefined,
                "name": "str_replace_editor",
                "type": "text_editor_20241022",
              },
            ],
          }
        `);
      });
    });

    it('should correctly prepare bash_20241022 tool', async () => {
      const result = await prepareTools({
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
              "cache_control": undefined,
              "name": "bash",
              "type": "bash_20241022",
            },
          ],
        }
      `);
    });

    it('should correctly prepare text_editor_20250728 with max_characters', async () => {
      const result = await prepareTools({
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
              "cache_control": undefined,
              "max_characters": 10000,
              "name": "str_replace_based_edit_tool",
              "type": "text_editor_20250728",
            },
          ],
        }
      `);
    });

    it('should correctly prepare text_editor_20250728 without max_characters', async () => {
      const result = await prepareTools({
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
              "cache_control": undefined,
              "max_characters": undefined,
              "name": "str_replace_based_edit_tool",
              "type": "text_editor_20250728",
            },
          ],
        }
      `);
    });

    it('should correctly prepare web_search_20250305', async () => {
      const result = await prepareTools({
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
              "cache_control": undefined,
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

    it('should correctly prepare web_fetch_20250910', async () => {
      const result = await prepareTools({
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
              "cache_control": undefined,
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

  it('should add warnings for unsupported tools', async () => {
    const result = await prepareTools({
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
          "feature": "provider-defined tool unsupported.tool",
          "type": "unsupported",
        },
      ]
    `);
  });

  it('should handle tool choice "auto"', async () => {
    const result = await prepareTools({
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

  it('should handle tool choice "required"', async () => {
    const result = await prepareTools({
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

  it('should handle tool choice "none"', async () => {
    const result = await prepareTools({
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

  it('should handle tool choice "tool"', async () => {
    const result = await prepareTools({
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

  it('should set cache control', async () => {
    const result = await prepareTools({
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

  it('should limit cache breakpoints to 4', async () => {
    const cacheControlValidator = new CacheControlValidator();
    const result = await prepareTools({
      tools: [
        {
          type: 'function',
          name: 'tool1',
          description: 'Test 1',
          inputSchema: {},
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          type: 'function',
          name: 'tool2',
          description: 'Test 2',
          inputSchema: {},
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          type: 'function',
          name: 'tool3',
          description: 'Test 3',
          inputSchema: {},
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          type: 'function',
          name: 'tool4',
          description: 'Test 4',
          inputSchema: {},
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
        {
          type: 'function',
          name: 'tool5',
          description: 'Test 5 (should be rejected)',
          inputSchema: {},
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } },
          },
        },
      ],
      cacheControlValidator,
    });

    // First 4 should have cache_control
    expect(result.tools?.[0]).toHaveProperty('cache_control', {
      type: 'ephemeral',
    });
    expect(result.tools?.[1]).toHaveProperty('cache_control', {
      type: 'ephemeral',
    });
    expect(result.tools?.[2]).toHaveProperty('cache_control', {
      type: 'ephemeral',
    });
    expect(result.tools?.[3]).toHaveProperty('cache_control', {
      type: 'ephemeral',
    });

    // 5th should be rejected (cache_control should be undefined)
    expect(result.tools?.[4]).toHaveProperty('cache_control', undefined);

    expect(cacheControlValidator.getWarnings()).toMatchInlineSnapshot(`
      [
        {
          "details": "Maximum 4 cache breakpoints exceeded (found 5). This breakpoint will be ignored.",
          "feature": "cacheControl breakpoint limit",
          "type": "unsupported",
        },
      ]
    `);
  });
});
