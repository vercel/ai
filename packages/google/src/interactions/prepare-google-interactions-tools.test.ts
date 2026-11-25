import type { LanguageModelV4FunctionTool } from '@ai-sdk/provider';
import { redactTelemetryValue } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { withGoogleInteractionsRequestRedaction } from '../redact-google-tool-credentials';
import { mcpServer } from '../tool/mcp-server';
import { prepareGoogleInteractionsTools } from './prepare-google-interactions-tools';

const FUNCTION_TOOL: LanguageModelV4FunctionTool = {
  type: 'function',
  name: 'getWeather',
  description: 'Get the current weather in a location',
  inputSchema: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' },
    },
    required: ['location'],
  },
};

describe('prepareGoogleInteractionsTools', () => {
  it('returns undefined tools/toolChoice and no warnings when no tools are provided', () => {
    const result = prepareGoogleInteractionsTools({ tools: undefined });
    expect(result).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('treats an empty tools array as no tools', () => {
    const result = prepareGoogleInteractionsTools({ tools: [] });
    expect(result).toEqual({
      tools: undefined,
      toolChoice: undefined,
      toolWarnings: [],
    });
  });

  it('maps an AI SDK function tool to an Interactions function tool with passthrough JSON Schema', () => {
    const result = prepareGoogleInteractionsTools({
      tools: [FUNCTION_TOOL],
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "toolChoice": undefined,
        "toolWarnings": [],
        "tools": [
          {
            "description": "Get the current weather in a location",
            "name": "getWeather",
            "parameters": {
              "properties": {
                "location": {
                  "description": "City name",
                  "type": "string",
                },
              },
              "required": [
                "location",
              ],
              "type": "object",
            },
            "type": "function",
          },
        ],
      }
    `);
  });

  it('emits an empty description string when the tool has none', () => {
    const result = prepareGoogleInteractionsTools({
      tools: [{ ...FUNCTION_TOOL, description: undefined }],
    });
    expect(result.tools?.[0]).toEqual({
      type: 'function',
      name: 'getWeather',
      description: '',
      parameters: FUNCTION_TOOL.inputSchema,
    });
  });

  describe('provider-defined tools', () => {
    const cases: Array<{
      title: string;
      id: `${string}.${string}`;
      args: Record<string, unknown>;
      expected: Record<string, unknown>;
    }> = [
      {
        title: 'google.google_search (no args)',
        id: 'google.google_search',
        args: {},
        expected: { type: 'google_search' },
      },
      {
        title: 'google.google_search with searchTypes',
        id: 'google.google_search',
        args: { searchTypes: { webSearch: {}, imageSearch: {} } },
        expected: {
          type: 'google_search',
          search_types: ['web_search', 'image_search'],
        },
      },
      {
        title: 'google.code_execution',
        id: 'google.code_execution',
        args: {},
        expected: { type: 'code_execution' },
      },
      {
        title: 'google.url_context',
        id: 'google.url_context',
        args: {},
        expected: { type: 'url_context' },
      },
      {
        title: 'google.file_search',
        id: 'google.file_search',
        args: {
          fileSearchStoreNames: ['fileSearchStores/foo'],
          topK: 4,
          metadataFilter: 'a = "b"',
        },
        expected: {
          type: 'file_search',
          file_search_store_names: ['fileSearchStores/foo'],
          top_k: 4,
          metadata_filter: 'a = "b"',
        },
      },
      {
        title: 'google.google_maps',
        id: 'google.google_maps',
        args: { latitude: 37.7749, longitude: -122.4194, enableWidget: true },
        expected: {
          type: 'google_maps',
          latitude: 37.7749,
          longitude: -122.4194,
          enable_widget: true,
        },
      },
      {
        title: 'google.computer_use',
        id: 'google.computer_use',
        args: {},
        expected: { type: 'computer_use', environment: 'browser' },
      },
      {
        title: 'google.mcp_server',
        id: 'google.mcp_server',
        args: {
          name: 'my-mcp',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer x' },
          allowedTools: ['foo'],
        },
        expected: {
          type: 'mcp_server',
          name: 'my-mcp',
          url: 'https://example.com/mcp',
          headers: { Authorization: 'Bearer x' },
          allowed_tools: ['foo'],
        },
      },
      {
        title: 'google.retrieval',
        id: 'google.retrieval',
        args: {
          retrievalTypes: ['vertex_ai_search'],
          vertexAiSearchConfig: {
            datastores: ['projects/p/locations/l/dataStores/d'],
          },
        },
        expected: {
          type: 'retrieval',
          retrieval_types: ['vertex_ai_search'],
          vertex_ai_search_config: {
            datastores: ['projects/p/locations/l/dataStores/d'],
          },
        },
      },
    ];

    for (const { title, id, args, expected } of cases) {
      it(`maps ${title}`, () => {
        const result = prepareGoogleInteractionsTools({
          tools: [
            {
              type: 'provider',
              id,
              name: id.split('.')[1],
              args,
            },
          ],
        });
        expect(result.toolWarnings).toEqual([]);
        expect(result.tools).toEqual([expected]);
      });

      it(`omits ${title} when toolChoice is none`, () => {
        const result = prepareGoogleInteractionsTools({
          tools: [{ type: 'provider', id, name: id.split('.')[1], args }],
          toolChoice: { type: 'none' },
        });
        expect(result).toEqual({
          tools: undefined,
          toolChoice: undefined,
          toolWarnings: [],
        });
      });
    }

    it('warns and drops unknown google.* provider-defined tools', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [
          {
            type: 'provider',
            id: 'google.unknown_tool',
            name: 'unknown_tool',
            args: {},
          },
        ],
      });
      expect(result.tools).toBeUndefined();
      expect(result.toolWarnings).toMatchInlineSnapshot(`
        [
          {
            "details": "provider-defined tool google.unknown_tool is not supported by google.interactions; tool dropped.",
            "feature": "provider-defined tool google.unknown_tool",
            "type": "unsupported",
          },
        ]
      `);
    });
  });

  describe('toolChoice mapping', () => {
    it('maps "auto" to "auto"', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [FUNCTION_TOOL],
        toolChoice: { type: 'auto' },
      });
      expect(result.toolChoice).toBe('auto');
    });

    it('maps "required" to "any"', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [FUNCTION_TOOL],
        toolChoice: { type: 'required' },
      });
      expect(result.toolChoice).toBe('any');
    });

    it('omits function tools when toolChoice is none', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [FUNCTION_TOOL],
        toolChoice: { type: 'none' },
      });
      expect(result).toEqual({
        tools: undefined,
        toolChoice: undefined,
        toolWarnings: [],
      });
    });

    it('maps { type: "tool", toolName } to { allowed_tools: { mode: "validated", tools: [name] } }', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [FUNCTION_TOOL],
        toolChoice: { type: 'tool', toolName: 'getWeather' },
      });
      expect(result.toolChoice).toMatchInlineSnapshot(`
        {
          "allowed_tools": {
            "mode": "validated",
            "tools": [
              "getWeather",
            ],
          },
        }
      `);
    });
  });

  describe('MCP server credentials', () => {
    it('supplies telemetry redaction for configuration and wire bodies', () => {
      const tool = mcpServer({
        name: 'local-mcp',
        url: 'https://example.com/mcp',
        headers: {
          Authorization: 'test-secret',
          'X-Custom-Key': 'test-secret',
        },
        allowedTools: ['getWeather'],
      });
      const originalArgs = structuredClone(tool.args);
      const result = prepareGoogleInteractionsTools({
        tools: [
          { type: 'provider', id: tool.id, name: 'connector', args: tool.args },
        ],
      });
      const body = withGoogleInteractionsRequestRedaction({
        tools: result.tools,
      });

      for (const value of [tool.args, body]) {
        expect(JSON.stringify(value)).toContain('test-secret');
        expect(JSON.stringify(redactTelemetryValue(value))).toBe(
          JSON.stringify(value).replaceAll('test-secret', '[redacted]'),
        );
      }

      expect(body.tools).toEqual([
        {
          type: 'mcp_server',
          name: 'local-mcp',
          url: 'https://example.com/mcp',
          headers: {
            Authorization: 'test-secret',
            'X-Custom-Key': 'test-secret',
          },
          allowed_tools: ['getWeather'],
        },
      ]);
      expect(tool.args).toEqual(originalArgs);
    });
  });

  describe('tool retrieval', () => {
    const TOOL_SEARCH = {
      type: 'provider',
      id: 'google.tool_search',
      name: 'tool_search',
      args: {},
    } as const;

    const deferredTool = (
      name: string,
      shortDescription?: string,
    ): LanguageModelV4FunctionTool => ({
      ...FUNCTION_TOOL,
      name,
      providerOptions: {
        google: {
          deferLoading: true,
          ...(shortDescription != null ? { shortDescription } : {}),
        },
      },
    });

    it('maps google.tool_search and defers the tools that opt in', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [TOOL_SEARCH, deferredTool('getWeather', 'Weather by city.')],
      });

      expect(result.toolWarnings).toEqual([]);
      expect(result.tools).toEqual([
        { type: 'tool_search' },
        {
          type: 'function',
          name: 'getWeather',
          description: FUNCTION_TOOL.description,
          parameters: FUNCTION_TOOL.inputSchema,
          defer_loading: true,
          short_description: 'Weather by city.',
        },
      ]);
    });

    it('omits short_description when the tool does not provide one', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [TOOL_SEARCH, deferredTool('getWeather')],
      });

      expect(result.tools?.[1]).not.toHaveProperty('short_description');
      expect(result.tools?.[1]).toMatchObject({ defer_loading: true });
    });

    it('leaves tools without deferLoading untouched', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [TOOL_SEARCH, FUNCTION_TOOL],
      });

      expect(result.tools?.[1]).not.toHaveProperty('defer_loading');
    });

    it('drops the tool search tool and declares deferred tools in full when toolChoice is required', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [TOOL_SEARCH, deferredTool('getWeather', 'Weather by city.')],
        toolChoice: { type: 'required' },
      });

      expect(result.tools).toEqual([
        {
          type: 'function',
          name: 'getWeather',
          description: FUNCTION_TOOL.description,
          parameters: FUNCTION_TOOL.inputSchema,
        },
      ]);
      expect(result.toolWarnings).toMatchInlineSnapshot(`
        [
          {
            "details": "a forced tool call cannot wait for tool retrieval; the tool search tool is dropped and deferred tools are declared in full.",
            "feature": "google.tool_search with toolChoice required",
            "type": "unsupported",
          },
          {
            "details": "tool getWeather is forced by toolChoice, so it cannot wait for tool retrieval; the tool is declared in full.",
            "feature": "deferLoading on tool getWeather",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('keeps the tool search tool when a specific tool is forced, and declares only that tool in full', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [
          TOOL_SEARCH,
          deferredTool('getWeather'),
          deferredTool('getTime'),
        ],
        toolChoice: { type: 'tool', toolName: 'getWeather' },
      });

      expect(result.tools).toEqual([
        { type: 'tool_search' },
        {
          type: 'function',
          name: 'getWeather',
          description: FUNCTION_TOOL.description,
          parameters: FUNCTION_TOOL.inputSchema,
        },
        {
          type: 'function',
          name: 'getTime',
          description: FUNCTION_TOOL.description,
          parameters: FUNCTION_TOOL.inputSchema,
          defer_loading: true,
        },
      ]);
    });

    it('declares deferred tools in full when the tool search tool is not registered', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [deferredTool('getWeather', 'Weather by city.')],
      });

      expect(result.tools).toEqual([
        {
          type: 'function',
          name: 'getWeather',
          description: FUNCTION_TOOL.description,
          parameters: FUNCTION_TOOL.inputSchema,
        },
      ]);
      expect(result.toolWarnings).toMatchInlineSnapshot(`
        [
          {
            "details": "deferLoading on tool getWeather requires googleTools.toolSearch() to be registered; the tool is declared in full.",
            "feature": "deferLoading on tool getWeather",
            "type": "unsupported",
          },
        ]
      `);
    });

    it('does not defer an MCP server without the tool search tool', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [
          {
            type: 'provider',
            id: 'google.mcp_server',
            name: 'mcp_server',
            args: { name: 'docs', deferLoading: true },
          },
        ],
      });

      expect(result.tools?.[0]).not.toHaveProperty('defer_loading');
    });

    it('defers every tool an MCP server exposes', () => {
      const result = prepareGoogleInteractionsTools({
        tools: [
          TOOL_SEARCH,
          {
            type: 'provider',
            id: 'google.mcp_server',
            name: 'mcp_server',
            args: {
              name: 'docs',
              url: 'https://example.com/mcp',
              deferLoading: true,
            },
          },
        ],
      });

      expect(result.toolWarnings).toEqual([]);
      expect(result.tools?.[1]).toEqual({
        type: 'mcp_server',
        name: 'docs',
        url: 'https://example.com/mcp',
        defer_loading: true,
      });
    });
  });
});
