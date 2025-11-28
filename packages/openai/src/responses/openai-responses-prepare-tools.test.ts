import { ToolNameMapping } from '@ai-sdk/provider-utils';
import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { describe, it, expect } from 'vitest';

describe('prepareResponsesTools', () => {
  describe('code interpreter', () => {
    it('should prepare code interpreter tool with no container (auto mode)', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "container": {
                "file_ids": undefined,
                "type": "auto",
              },
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should prepare code interpreter tool with string container ID', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: 'container-123',
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "container": "container-123",
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should prepare code interpreter tool with file IDs container', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: ['file-1', 'file-2', 'file-3'],
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "container": {
                "file_ids": [
                  "file-1",
                  "file-2",
                  "file-3",
                ],
                "type": "auto",
              },
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should prepare code interpreter tool with empty file IDs array', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: [],
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "container": {
                "file_ids": [],
                "type": "auto",
              },
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should prepare code interpreter tool with undefined file IDs', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: undefined,
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "container": {
                "file_ids": undefined,
                "type": "auto",
              },
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should handle tool choice selection with code interpreter', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: {
          type: 'tool',
          toolName: 'code_interpreter',
        },
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": {
            "type": "code_interpreter",
          },
          "toolWarnings": [],
          "tools": [
            {
              "container": {
                "file_ids": undefined,
                "type": "auto",
              },
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });

    it('should handle multiple tools including code interpreter', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: 'my-container',
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: true,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
            {
              "container": "my-container",
              "type": "code_interpreter",
            },
          ],
        }
      `);
    });
  });

  describe('image generation', () => {
    it('should prepare image_generation tool with all options', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.image_generation',
            name: 'image_generation',
            args: {
              background: 'opaque',
              size: '1536x1024',
              quality: 'high',
              moderation: 'auto',
              outputFormat: 'png',
              outputCompression: 100,
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "background": "opaque",
              "input_fidelity": undefined,
              "input_image_mask": undefined,
              "model": undefined,
              "moderation": "auto",
              "output_compression": 100,
              "output_format": "png",
              "partial_images": undefined,
              "quality": "high",
              "size": "1536x1024",
              "type": "image_generation",
            },
          ],
        }
      `);
    });

    it('should support tool choice selection for image_generation', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.image_generation',
            name: 'image_generation',
            args: {},
          },
        ],
        toolChoice: { type: 'tool', toolName: 'image_generation' },
        strictJsonSchema: false,
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "background": undefined,
            "input_fidelity": undefined,
            "input_image_mask": undefined,
            "model": undefined,
            "moderation": undefined,
            "output_compression": undefined,
            "output_format": undefined,
            "partial_images": undefined,
            "quality": undefined,
            "size": undefined,
            "type": "image_generation",
          },
        ]
      `);
    });
  });

  describe('local shell', () => {
    it('should prepare local_shell tool', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.local_shell',
            name: 'local_shell',
            args: {},
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "local_shell",
            },
          ],
        }
      `);
    });
  });

  describe('web search', () => {
    it('should prepare web_search tool with no options', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {},
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": undefined,
              "filters": undefined,
              "search_context_size": undefined,
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });

    it('should prepare web_search tool with externalWebAccess set to true', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              externalWebAccess: true,
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": true,
              "filters": undefined,
              "search_context_size": undefined,
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });

    it('should prepare web_search tool with externalWebAccess set to false', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              externalWebAccess: false,
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": false,
              "filters": undefined,
              "search_context_size": undefined,
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });

    it('should prepare web_search tool with all options including externalWebAccess', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              externalWebAccess: true,
              filters: {
                allowedDomains: ['example.com', 'test.org'],
              },
              searchContextSize: 'high',
              userLocation: {
                type: 'approximate',
                country: 'US',
                city: 'San Francisco',
                region: 'California',
                timezone: 'America/Los_Angeles',
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": true,
              "filters": {
                "allowed_domains": [
                  "example.com",
                  "test.org",
                ],
              },
              "search_context_size": "high",
              "type": "web_search",
              "user_location": {
                "city": "San Francisco",
                "country": "US",
                "region": "California",
                "timezone": "America/Los_Angeles",
                "type": "approximate",
              },
            },
          ],
        }
      `);
    });

    it('should prepare web_search tool with filters but no externalWebAccess', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              filters: {
                allowedDomains: ['example.com'],
              },
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": undefined,
              "filters": {
                "allowed_domains": [
                  "example.com",
                ],
              },
              "search_context_size": undefined,
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });

    it('should handle tool choice selection with web_search', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              externalWebAccess: true,
            },
          },
        ],
        toolChoice: {
          type: 'tool',
          toolName: 'web_search',
        },
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": {
            "type": "web_search",
          },
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": true,
              "filters": undefined,
              "search_context_size": undefined,
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });

    it('should handle multiple tools including web_search', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              externalWebAccess: false,
              searchContextSize: 'medium',
            },
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: true,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
            {
              "external_web_access": false,
              "filters": undefined,
              "search_context_size": "medium",
              "type": "web_search",
              "user_location": undefined,
            },
          ],
        }
      `);
    });
  });

  describe('apply_patch', () => {
    it('should prepare apply_patch tool', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.apply_patch',
            name: 'apply_patch',
            args: {},
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "apply_patch",
            },
          ],
        }
      `);
    });

    it('should handle tool choice selection with apply_patch', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.apply_patch',
            name: 'apply_patch',
            args: {},
          },
        ],
        toolChoice: {
          type: 'tool',
          toolName: 'apply_patch',
        },
        strictJsonSchema: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": {
            "type": "apply_patch",
          },
          "toolWarnings": [],
          "tools": [
            {
              "type": "apply_patch",
            },
          ],
        }
      `);
    });

    it('should handle multiple tools including apply_patch', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: {
              type: 'object',
              properties: {
                input: { type: 'string' },
              },
            },
          },
          {
            type: 'provider',
            id: 'openai.apply_patch',
            name: 'apply_patch',
            args: {},
          },
        ],
        toolChoice: undefined,
        strictJsonSchema: true,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A test function",
              "name": "testFunction",
              "parameters": {
                "properties": {
                  "input": {
                    "type": "string",
                  },
                },
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
            {
              "type": "apply_patch",
            },
          ],
        }
      `);
    });
  });
});
