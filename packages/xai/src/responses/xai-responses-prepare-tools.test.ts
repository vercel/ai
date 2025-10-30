import { describe, expect, it } from 'vitest';
import { prepareResponsesTools } from './xai-responses-prepare-tools';

describe('prepareResponsesTools', () => {
  describe('web_search', () => {
    it('should prepare web_search tool with no args', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "allowed_domains": undefined,
              "enable_image_understanding": undefined,
              "excluded_domains": undefined,
              "type": "web_search",
            },
          ],
        }
      `);
    });

    it('should prepare web_search tool with allowed domains', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {
              allowedDomains: ['wikipedia.org', 'example.com'],
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_domains": [
              "wikipedia.org",
              "example.com",
            ],
            "enable_image_understanding": undefined,
            "excluded_domains": undefined,
            "type": "web_search",
          },
        ]
      `);
    });

    it('should prepare web_search tool with excluded domains', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {
              excludedDomains: ['spam.com'],
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_domains": undefined,
            "enable_image_understanding": undefined,
            "excluded_domains": [
              "spam.com",
            ],
            "type": "web_search",
          },
        ]
      `);
    });

    it('should prepare web_search tool with image understanding', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {
              enableImageUnderstanding: true,
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_domains": undefined,
            "enable_image_understanding": true,
            "excluded_domains": undefined,
            "type": "web_search",
          },
        ]
      `);
    });
  });

  describe('x_search', () => {
    it('should prepare x_search tool with no args', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.x_search',
            name: 'x_search',
            args: {},
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_x_handles": undefined,
            "enable_image_understanding": undefined,
            "enable_video_understanding": undefined,
            "excluded_x_handles": undefined,
            "from_date": undefined,
            "to_date": undefined,
            "type": "x_search",
          },
        ]
      `);
    });

    it('should prepare x_search tool with allowed handles', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.x_search',
            name: 'x_search',
            args: {
              allowedXHandles: ['elonmusk', 'xai'],
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_x_handles": [
              "elonmusk",
              "xai",
            ],
            "enable_image_understanding": undefined,
            "enable_video_understanding": undefined,
            "excluded_x_handles": undefined,
            "from_date": undefined,
            "to_date": undefined,
            "type": "x_search",
          },
        ]
      `);
    });

    it('should prepare x_search tool with date range', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.x_search',
            name: 'x_search',
            args: {
              fromDate: '2025-01-01',
              toDate: '2025-12-31',
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_x_handles": undefined,
            "enable_image_understanding": undefined,
            "enable_video_understanding": undefined,
            "excluded_x_handles": undefined,
            "from_date": "2025-01-01",
            "to_date": "2025-12-31",
            "type": "x_search",
          },
        ]
      `);
    });

    it('should prepare x_search tool with video understanding', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.x_search',
            name: 'x_search',
            args: {
              enableVideoUnderstanding: true,
              enableImageUnderstanding: true,
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "allowed_x_handles": undefined,
            "enable_image_understanding": true,
            "enable_video_understanding": true,
            "excluded_x_handles": undefined,
            "from_date": undefined,
            "to_date": undefined,
            "type": "x_search",
          },
        ]
      `);
    });
  });

  describe('code_execution', () => {
    it('should prepare code_execution tool as code_interpreter', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.code_execution',
            name: 'code_execution',
            args: {},
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "type": "code_interpreter",
          },
        ]
      `);
    });
  });

  describe('function tools', () => {
    it('should prepare function tools', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'weather',
            description: 'get weather information',
            inputSchema: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        ],
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "function": {
              "description": "get weather information",
              "name": "weather",
              "parameters": {
                "properties": {
                  "location": {
                    "type": "string",
                  },
                },
                "required": [
                  "location",
                ],
                "type": "object",
              },
            },
            "type": "function",
          },
        ]
      `);
    });
  });

  describe('tool choice', () => {
    it('should handle tool choice auto', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
        toolChoice: { type: 'auto' },
      });

      expect(result.toolChoice).toBe('auto');
    });

    it('should handle tool choice required', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
        toolChoice: { type: 'required' },
      });

      expect(result.toolChoice).toBe('required');
    });

    it('should handle tool choice none', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
        toolChoice: { type: 'none' },
      });

      expect(result.toolChoice).toBe('none');
    });

    it('should handle specific tool choice', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'weather',
            description: 'get weather',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: { type: 'tool', toolName: 'weather' },
      });

      expect(result.toolChoice).toBe('weather');
    });
  });

  describe('multiple tools', () => {
    it('should handle multiple tools including provider-defined and functions', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'calculator',
            description: 'calculate numbers',
            inputSchema: { type: 'object', properties: {} },
          },
          {
            type: 'provider-defined',
            id: 'xai.web_search',
            name: 'web_search',
            args: {},
          },
          {
            type: 'provider-defined',
            id: 'xai.x_search',
            name: 'x_search',
            args: {},
          },
        ],
      });

      expect(result.tools).toHaveLength(3);
      expect(result.tools?.[0].type).toBe('function');
      expect(result.tools?.[1].type).toBe('web_search');
      expect(result.tools?.[2].type).toBe('x_search');
    });
  });

  describe('empty tools', () => {
    it('should return undefined for empty tools array', async () => {
      const result = await prepareResponsesTools({
        tools: [],
      });

      expect(result.tools).toBeUndefined();
      expect(result.toolChoice).toBeUndefined();
    });

    it('should return undefined for undefined tools', async () => {
      const result = await prepareResponsesTools({
        tools: undefined,
      });

      expect(result.tools).toBeUndefined();
    });
  });

  describe('unsupported tools', () => {
    it('should warn about unsupported provider-defined tools', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'unsupported.tool',
            name: 'unsupported',
            args: {},
          },
        ],
      });

      expect(result.toolWarnings).toHaveLength(1);
      expect(result.toolWarnings[0].type).toBe('unsupported-tool');
    });
  });
});
