import { describe, it, expect } from 'vitest';
import { prepareTools } from './anthropic-prepare-tools';
import { CacheControlValidator } from './get-cache-control';
import { webFetch_20250910OutputSchema } from './tool/web-fetch-20250910';
import { webSearch_20250305OutputSchema } from './tool/web-search_20250305';
import {
  anthropicMessagesChunkSchema,
  anthropicMessagesResponseSchema,
} from './anthropic-messages-api';

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

    // Should have warning
    expect(cacheControlValidator.getWarnings()).toContainEqual({
      type: 'unsupported-setting',
      setting: 'cacheControl',
      details: expect.stringContaining('Maximum 4 cache breakpoints exceeded'),
    });
  });
});

describe('webFetch_20250910OutputSchema', () => {
  it('should not fail validation when title is null', async () => {
    const problematicResponse = {
      type: 'web_fetch_result',
      url: 'https://test.com',
      retrievedAt: '2025-12-08T20:46:31.114158',
      content: {
        type: 'document',
        title: null,
        source: {
          type: 'text',
          mediaType: 'text/plain',
          data: '',
        },
      },
    };

    const schema = webFetch_20250910OutputSchema();

    const result = await schema.validate!(problematicResponse);

    expect(result.success).toBe(true);
  });

  it('should accept valid response with string title', async () => {
    const validResponse = {
      type: 'web_fetch_result',
      url: 'https://test.com',
      retrievedAt: '2025-12-08T20:46:31.114158',
      content: {
        type: 'document',
        title: 'Example Title',
        source: {
          type: 'text',
          mediaType: 'text/plain',
          data: 'Some content',
        },
      },
    };

    const schema = webFetch_20250910OutputSchema();
    const result = await schema.validate!(validResponse);

    expect(result.success).toBe(true);
  });
});

describe('webSearch_20250305OutputSchema', () => {
  it('should not fail validation when title is null', async () => {
    const problematicResponse = [
      {
        url: 'https://test.com',
        title: null,
        pageAge: 'April 30, 2025',
        encryptedContent:
          'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
        type: 'web_search_result',
      },
    ];

    const schema = webSearch_20250305OutputSchema();

    const result = await schema.validate!(problematicResponse);

    expect(result.success).toBe(true);
  });

  it('should accept valid response with string title', async () => {
    const validResponse = [
      {
        url: 'https://test.com',
        title: 'Test title',
        pageAge: 'April 30, 2025',
        encryptedContent:
          'EqgfCioIARgBIiQ3YTAwMjY1Mi1mZjM5LTQ1NGUtODgxNC1kNjNjNTk1ZWI3Y...',
        type: 'web_search_result',
      },
    ];

    const schema = webSearch_20250305OutputSchema();
    const result = await schema.validate!(validResponse);

    expect(result.success).toBe(true);
  });
});

describe('anthropicMessagesResponseSchema - web_fetch_tool_result', () => {
  it('should accept PDF response with base64 source', async () => {
    const pdfResponse = {
      type: 'message',
      id: '123',
      model: 'claude-3-5-sonnet-20241022',
      content: [
        {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srvtoolu_01234567890abcdef',
          content: {
            type: 'web_fetch_result',
            url: 'https://test.com',
            retrieved_at: '2025-12-08T20:46:31.114158',
            content: {
              type: 'document',
              title: 'Example Title',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: 'JVBERi0xLjcNJeLjz9MNC',
              },
            },
          },
        },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    };

    const schema = anthropicMessagesResponseSchema();
    const result = await schema.validate!(pdfResponse);

    expect(result.success).toBe(true);
  });

  it('should accept text source in response', async () => {
    const textResponse = {
      type: 'message',
      id: '123',
      model: 'claude-3-5-sonnet-20241022',
      content: [
        {
          type: 'web_fetch_tool_result',
          tool_use_id: 'srvtoolu_01234567890abcdef',
          content: {
            type: 'web_fetch_result',
            url: 'https://test.com',
            retrieved_at: '2025-12-08T20:46:31.114158',
            content: {
              type: 'document',
              title: 'Example Title',
              source: {
                type: 'text',
                media_type: 'text/plain',
                data: 'content',
              },
            },
          },
        },
      ],
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
      },
    };

    const schema = anthropicMessagesResponseSchema();
    const result = await schema.validate!(textResponse);

    expect(result.success).toBe(true);
  });
});

describe('anthropicMessagesChunkSchema - web_fetch_tool_result', () => {
  it('should accept base64 PDF source in streaming response', async () => {
    const pdfChunk = {
      type: 'content_block_start',
      index: 10,
      content_block: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'srvtoolu_01234567890abcdef',
        content: {
          type: 'web_fetch_result',
          url: 'https://test.com',
          retrieved_at: '2025-12-08T20:46:31.114158',
          content: {
            type: 'document',
            title: null,
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: 'JVBERi0xLjcNJeLjz9MNC',
            },
          },
        },
      },
    };

    const schema = anthropicMessagesChunkSchema();
    const result = await schema.validate!(pdfChunk);

    expect(result.success).toBe(true);
  });

  it('should accept text source in streaming response', async () => {
    const pdfChunk = {
      type: 'content_block_start',
      index: 10,
      content_block: {
        type: 'web_fetch_tool_result',
        tool_use_id: 'srvtoolu_01234567890abcdef',
        content: {
          type: 'web_fetch_result',
          url: 'https://test.com',
          retrieved_at: '2025-12-08T20:46:31.114158',
          content: {
            type: 'document',
            title: null,
            source: {
              type: 'text',
              media_type: 'text/plain',
              data: 'content',
            },
          },
        },
      },
    };

    const schema = anthropicMessagesChunkSchema();
    const result = await schema.validate!(pdfChunk);

    expect(result.success).toBe(true);
  });
});
