import { NoSuchProviderReferenceError } from '@ai-sdk/provider';
import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { describe, it, expect } from 'vitest';

describe('prepareResponsesTools', () => {
  describe('function tools strict mode', () => {
    it('should pass through strict mode when strict is true', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
            strict: true,
          },
        ],
        toolChoice: undefined,
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
                "properties": {},
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should pass through strict mode when strict is false', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
            strict: false,
          },
        ],
        toolChoice: undefined,
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
                "properties": {},
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should not include strict mode when strict is undefined', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: undefined,
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
                "properties": {},
                "type": "object",
              },
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should pass through strict mode for multiple tools with different strict settings', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'strictTool',
            description: 'A strict tool',
            inputSchema: { type: 'object', properties: {} },
            strict: true,
          },
          {
            type: 'function',
            name: 'nonStrictTool',
            description: 'A non-strict tool',
            inputSchema: { type: 'object', properties: {} },
            strict: false,
          },
          {
            type: 'function',
            name: 'defaultTool',
            description: 'A tool without strict setting',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "A strict tool",
              "name": "strictTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": true,
              "type": "function",
            },
            {
              "description": "A non-strict tool",
              "name": "nonStrictTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "strict": false,
              "type": "function",
            },
            {
              "description": "A tool without strict setting",
              "name": "defaultTool",
              "parameters": {
                "properties": {},
                "type": "object",
              },
              "type": "function",
            },
          ],
        }
      `);
    });
  });

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
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "action": undefined,
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

    it('should pass action, low moderation and a gpt-image-2 size', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.image_generation',
            name: 'image_generation',
            args: {
              action: 'edit',
              model: 'gpt-image-2',
              moderation: 'low',
              size: '1536x864',
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result.toolWarnings).toEqual([]);
      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "action": "edit",
            "background": undefined,
            "input_fidelity": undefined,
            "input_image_mask": undefined,
            "model": "gpt-image-2",
            "moderation": "low",
            "output_compression": undefined,
            "output_format": undefined,
            "partial_images": undefined,
            "quality": undefined,
            "size": "1536x864",
            "type": "image_generation",
          },
        ]
      `);
    });

    it('should reject a size that is not WIDTHxHEIGHT', async () => {
      await expect(
        prepareResponsesTools({
          tools: [
            {
              type: 'provider',
              id: 'openai.image_generation',
              name: 'image_generation',
              args: { size: 'large' },
            },
          ],
          toolChoice: undefined,
        }),
      ).rejects.toThrow();
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
      });

      expect(result.tools).toMatchInlineSnapshot(`
        [
          {
            "action": undefined,
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
                blockedDomains: ['blocked.example', 'blocked.test'],
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
                "blocked_domains": [
                  "blocked.example",
                  "blocked.test",
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

    it('should prepare web_search tool with blocked domains', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'web_search',
            args: {
              filters: {
                blockedDomains: ['example.com'],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "external_web_access": undefined,
              "filters": {
                "allowed_domains": undefined,
                "blocked_domains": [
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

  describe('shell', () => {
    it('should prepare shell tool without environment args', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {},
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerAuto without skills', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": undefined,
                "skills": undefined,
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerAuto and providerReference skills', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                skills: [
                  {
                    type: 'skillReference',
                    providerReference: { openai: 'skill_abc' },
                    version: '1.0.0',
                  },
                ],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": undefined,
                "skills": [
                  {
                    "skill_id": "skill_abc",
                    "type": "skill_reference",
                    "version": "1.0.0",
                  },
                ],
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should default shell skillReference version to latest when omitted', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                skills: [
                  {
                    type: 'skillReference',
                    providerReference: { openai: 'skill_abc' },
                  },
                ],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": undefined,
                "skills": [
                  {
                    "skill_id": "skill_abc",
                    "type": "skill_reference",
                    "version": "latest",
                  },
                ],
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should throw when a providerReference cannot be resolved for openai', async () => {
      try {
        await prepareResponsesTools({
          tools: [
            {
              type: 'provider',
              id: 'openai.shell',
              name: 'shell',
              args: {
                environment: {
                  type: 'containerAuto',
                  skills: [
                    {
                      type: 'skillReference',
                      providerReference: { anthropic: 'skill_abc' },
                    },
                  ],
                },
              },
            },
          ],
          toolChoice: undefined,
        });

        expect.unreachable('should have thrown');
      } catch (error) {
        expect(NoSuchProviderReferenceError.isInstance(error)).toBe(true);
        expect((error as NoSuchProviderReferenceError).provider).toBe('openai');
        expect((error as NoSuchProviderReferenceError).reference).toStrictEqual(
          {
            anthropic: 'skill_abc',
          },
        );
      }
    });

    it('should prepare shell tool with containerAuto and inline skill', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                skills: [
                  {
                    type: 'inline',
                    name: 'my-skill',
                    description: 'A test skill',
                    source: {
                      type: 'base64',
                      mediaType: 'application/zip',
                      data: 'dGVzdA==',
                    },
                  },
                ],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": undefined,
                "skills": [
                  {
                    "description": "A test skill",
                    "name": "my-skill",
                    "source": {
                      "data": "dGVzdA==",
                      "media_type": "application/zip",
                      "type": "base64",
                    },
                    "type": "inline",
                  },
                ],
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerAuto and networkPolicy disabled', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                networkPolicy: { type: 'disabled' },
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": {
                  "type": "disabled",
                },
                "skills": undefined,
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerAuto and networkPolicy allowlist with domain secrets', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                networkPolicy: {
                  type: 'allowlist',
                  allowedDomains: ['example.com', 'api.test.org'],
                  domainSecrets: [
                    {
                      domain: 'api.test.org',
                      name: 'API_KEY',
                      value: 'secret123',
                    },
                  ],
                },
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": undefined,
                "memory_limit": undefined,
                "network_policy": {
                  "allowed_domains": [
                    "example.com",
                    "api.test.org",
                  ],
                  "domain_secrets": [
                    {
                      "domain": "api.test.org",
                      "name": "API_KEY",
                      "value": "secret123",
                    },
                  ],
                  "type": "allowlist",
                },
                "skills": undefined,
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerAuto, fileIds, and memoryLimit', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerAuto',
                fileIds: ['file-1', 'file-2'],
                memoryLimit: '16g',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "file_ids": [
                  "file-1",
                  "file-2",
                ],
                "memory_limit": "16g",
                "network_policy": undefined,
                "skills": undefined,
                "type": "container_auto",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with containerReference', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'containerReference',
                containerId: 'ctr_abc123',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "container_id": "ctr_abc123",
                "type": "container_reference",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });
    it('should prepare shell tool with local environment and skills', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'local',
                skills: [
                  {
                    name: 'calculator',
                    description: 'Perform math calculations',
                    path: '/path/to/calculator',
                  },
                ],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "skills": [
                  {
                    "description": "Perform math calculations",
                    "name": "calculator",
                    "path": "/path/to/calculator",
                  },
                ],
                "type": "local",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with local environment without explicit type', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                skills: [
                  {
                    name: 'calculator',
                    description: 'Perform math calculations',
                    path: '/path/to/calculator',
                  },
                ],
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "skills": [
                  {
                    "description": "Perform math calculations",
                    "name": "calculator",
                    "path": "/path/to/calculator",
                  },
                ],
                "type": "local",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });

    it('should prepare shell tool with local environment without skills', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.shell',
            name: 'shell',
            args: {
              environment: {
                type: 'local',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "environment": {
                "skills": undefined,
                "type": "local",
              },
              "type": "shell",
            },
          ],
        }
      `);
    });
  });

  describe('custom tool', () => {
    it('should prepare custom tool with regex format', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.custom',
            name: 'write_sql',
            args: {
              description: 'Write a SQL SELECT query.',
              format: {
                type: 'grammar',
                syntax: 'regex',
                definition: 'SELECT .+',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": "Write a SQL SELECT query.",
              "format": {
                "definition": "SELECT .+",
                "syntax": "regex",
                "type": "grammar",
              },
              "name": "write_sql",
              "type": "custom",
            },
          ],
        }
      `);
    });

    it('should prepare custom tool with lark format', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.custom',
            name: 'generate_json',
            args: {
              format: {
                type: 'grammar',
                syntax: 'lark',
                definition: 'start: "{"  "}"',
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "description": undefined,
              "format": {
                "definition": "start: "{"  "}"",
                "syntax": "lark",
                "type": "grammar",
              },
              "name": "generate_json",
              "type": "custom",
            },
          ],
        }
      `);
    });

    it('should handle multiple tools including custom tool', async () => {
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
            id: 'openai.custom',
            name: 'write_sql',
            args: {
              description: 'Write SQL.',
              format: {
                type: 'grammar',
                syntax: 'regex',
                definition: 'SELECT .+',
              },
            },
          },
        ],
        toolChoice: undefined,
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
              "type": "function",
            },
            {
              "description": "Write SQL.",
              "format": {
                "definition": "SELECT .+",
                "syntax": "regex",
                "type": "grammar",
              },
              "name": "write_sql",
              "type": "custom",
            },
          ],
        }
      `);
    });

    it('should resolve custom tool choice using tool name', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.custom',
            name: 'write_sql',
            args: {},
          },
        ],
        toolChoice: { type: 'tool', toolName: 'write_sql' },
      });

      expect(result.toolChoice).toStrictEqual({
        type: 'custom',
        name: 'write_sql',
      });
    });
  });

  describe('computer', () => {
    it('should prepare computer tool', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.computer',
            name: 'computer',
            args: {},
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toEqual({
        tools: [{ type: 'computer' }],
        toolChoice: undefined,
        toolWarnings: [],
      });
    });

    it('should handle computer tool choice', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.computer',
            name: 'computer',
            args: {},
          },
        ],
        toolChoice: { type: 'tool', toolName: 'computer' },
      });

      expect(result.toolChoice).toEqual({ type: 'computer' });
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

  describe('tool search', () => {
    it('should prepare tool_search tool', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.tool_search',
            name: 'toolSearch',
            args: {},
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "tool_search",
            },
          ],
        }
      `);
    });

    it('should prepare tool_search alongside function tools with defer_loading', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.tool_search',
            name: 'toolSearch',
            args: {},
          },
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather',
            inputSchema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
              additionalProperties: false,
            },
            providerOptions: {
              openai: { deferLoading: true },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "tool_search",
            },
            {
              "defer_loading": true,
              "description": "Get the current weather",
              "name": "get_weather",
              "parameters": {
                "additionalProperties": false,
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
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should group function tools by OpenAI namespace provider option', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.tool_search',
            name: 'toolSearch',
            args: {},
          },
          {
            type: 'function',
            name: 'get_customer_profile',
            description: 'Fetch a customer profile by customer ID.',
            inputSchema: {
              type: 'object',
              properties: { customer_id: { type: 'string' } },
              required: ['customer_id'],
              additionalProperties: false,
            },
            providerOptions: {
              openai: {
                namespace: {
                  name: 'crm',
                  description:
                    'CRM tools for customer lookup and order management.',
                },
              },
            },
          },
          {
            type: 'function',
            name: 'get_weather',
            description: 'Get the current weather',
            inputSchema: {
              type: 'object',
              properties: { location: { type: 'string' } },
              required: ['location'],
              additionalProperties: false,
            },
          },
          {
            type: 'function',
            name: 'list_open_orders',
            description: 'List open orders for a customer ID.',
            inputSchema: {
              type: 'object',
              properties: { customer_id: { type: 'string' } },
              required: ['customer_id'],
              additionalProperties: false,
            },
            strict: true,
            providerOptions: {
              openai: {
                deferLoading: true,
                namespace: {
                  name: 'crm',
                  description:
                    'CRM tools for customer lookup and order management.',
                },
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "toolChoice": undefined,
          "toolWarnings": [],
          "tools": [
            {
              "type": "tool_search",
            },
            {
              "description": "CRM tools for customer lookup and order management.",
              "name": "crm",
              "tools": [
                {
                  "description": "Fetch a customer profile by customer ID.",
                  "name": "get_customer_profile",
                  "parameters": {
                    "additionalProperties": false,
                    "properties": {
                      "customer_id": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "customer_id",
                    ],
                    "type": "object",
                  },
                  "type": "function",
                },
                {
                  "defer_loading": true,
                  "description": "List open orders for a customer ID.",
                  "name": "list_open_orders",
                  "parameters": {
                    "additionalProperties": false,
                    "properties": {
                      "customer_id": {
                        "type": "string",
                      },
                    },
                    "required": [
                      "customer_id",
                    ],
                    "type": "object",
                  },
                  "strict": true,
                  "type": "function",
                },
              ],
              "type": "namespace",
            },
            {
              "description": "Get the current weather",
              "name": "get_weather",
              "parameters": {
                "additionalProperties": false,
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
              "type": "function",
            },
          ],
        }
      `);
    });

    it('should reject conflicting descriptions for the same OpenAI namespace', async () => {
      await expect(
        prepareResponsesTools({
          tools: [
            {
              type: 'function',
              name: 'get_customer_profile',
              description: 'Fetch a customer profile by customer ID.',
              inputSchema: { type: 'object', properties: {} },
              providerOptions: {
                openai: {
                  namespace: {
                    name: 'crm',
                    description: 'CRM tools.',
                  },
                },
              },
            },
            {
              type: 'function',
              name: 'list_open_orders',
              description: 'List open orders for a customer ID.',
              inputSchema: { type: 'object', properties: {} },
              providerOptions: {
                openai: {
                  namespace: {
                    name: 'crm',
                    description: 'Different CRM tools.',
                  },
                },
              },
            },
          ],
          toolChoice: undefined,
        }),
      ).rejects.toThrow(
        'conflicting descriptions for OpenAI tool namespace "crm"',
      );
    });
  });

  describe('allowedTools provider option', () => {
    const functionTool = {
      type: 'function',
      name: 'get_weather',
      description: 'Get weather',
      inputSchema: { type: 'object', properties: {} },
    } as const;

    const timeTool = {
      type: 'function',
      name: 'get_time',
      description: 'Get time',
      inputSchema: { type: 'object', properties: {} },
    } as const;

    const webSearchTool = {
      type: 'provider',
      id: 'openai.web_search',
      name: 'search',
      args: {},
    } as const;

    // mirrors the mapping the language model builds from its providerToolNames
    // registry, so canonical provider names resolve as they do in a request:
    const webSearchNameMapping = {
      toProviderToolName: (name: string) =>
        name === 'search' ? 'web_search' : name,
      toCustomToolName: (name: string) =>
        name === 'web_search' ? 'search' : name,
    };

    const mcpTool = (name: string, serverLabel: string) =>
      ({
        type: 'provider',
        id: 'openai.mcp',
        name,
        args: {
          serverLabel,
          serverUrl: `https://${serverLabel}.example.com/mcp`,
        },
      }) as const;

    const mcpNameMapping = {
      toProviderToolName: (name: string) =>
        name === 'alpha' || name === 'beta' ? 'mcp' : name,
      toCustomToolName: (name: string) => name,
    };

    it('should emit allowed_tools with default auto mode', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool, timeTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['get_weather'] },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'function', name: 'get_weather' }],
      });
      expect(result.tools).toHaveLength(2);
    });

    it('should emit allowed_tools with required mode', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool, timeTool],
        toolChoice: undefined,
        allowedTools: {
          toolNames: ['get_weather', 'get_time'],
          mode: 'required',
        },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'required',
        tools: [
          { type: 'function', name: 'get_weather' },
          { type: 'function', name: 'get_time' },
        ],
      });
      expect(result.tools).toHaveLength(2);
    });

    it('should override request-level toolChoice when allowedTools is set', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool],
        toolChoice: { type: 'required' },
        allowedTools: { toolNames: ['get_weather'] },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'function', name: 'get_weather' }],
      });
    });

    describe('entry shapes', () => {
      it.each([
        [
          'web search',
          {
            type: 'provider',
            id: 'openai.web_search',
            name: 'search',
            args: {},
          },
          'search',
          { type: 'web_search' },
        ],
        [
          'file search',
          {
            type: 'provider',
            id: 'openai.file_search',
            name: 'file_search',
            args: { vectorStoreIds: ['vs-1'] },
          },
          'file_search',
          { type: 'file_search' },
        ],
        [
          'web search preview',
          {
            type: 'provider',
            id: 'openai.web_search_preview',
            name: 'web_search_preview',
            args: {},
          },
          'web_search_preview',
          { type: 'web_search_preview' },
        ],
        [
          'image generation',
          {
            type: 'provider',
            id: 'openai.image_generation',
            name: 'image_generation',
            args: {},
          },
          'image_generation',
          { type: 'image_generation' },
        ],
        [
          'code interpreter',
          {
            type: 'provider',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
          'code_interpreter',
          { type: 'code_interpreter' },
        ],
        [
          'apply patch',
          {
            type: 'provider',
            id: 'openai.apply_patch',
            name: 'apply_patch',
            args: {},
          },
          'apply_patch',
          { type: 'apply_patch' },
        ],
        [
          'shell',
          { type: 'provider', id: 'openai.shell', name: 'shell', args: {} },
          'shell',
          { type: 'shell' },
        ],
        [
          'computer',
          {
            type: 'provider',
            id: 'openai.computer',
            name: 'computer',
            args: {},
          },
          'computer',
          { type: 'computer' },
        ],
        [
          'mcp (carries its server label)',
          {
            type: 'provider',
            id: 'openai.mcp',
            name: 'deepwiki',
            args: {
              serverLabel: 'deepwiki',
              serverUrl: 'https://mcp.deepwiki.com/mcp',
            },
          },
          'deepwiki',
          { type: 'mcp', server_label: 'deepwiki' },
        ],
        [
          'custom (carries its name)',
          {
            type: 'provider',
            id: 'openai.custom',
            name: 'write_sql',
            args: { description: 'Write a SQL SELECT query.' },
          },
          'write_sql',
          { type: 'custom', name: 'write_sql' },
        ],
      ])(
        'should emit the correct allowed_tools entry for %s',
        async (_label, tool, allowedName, expectedEntry) => {
          const result = await prepareResponsesTools({
            tools: [tool as any],
            toolChoice: undefined,
            allowedTools: { toolNames: [allowedName as string] },
          });

          expect(result.toolChoice).toEqual({
            type: 'allowed_tools',
            mode: 'auto',
            tools: [expectedEntry],
          });
          expect(result.toolWarnings).toEqual([]);
        },
      );
    });

    it('should preserve the order of mixed function and built-in entries without deduplicating', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool, webSearchTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['search', 'get_weather', 'search'] },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [
          { type: 'web_search' },
          { type: 'function', name: 'get_weather' },
          { type: 'web_search' },
        ],
      });
    });

    it('should resolve a built-in tool by its canonical provider name', async () => {
      const result = await prepareResponsesTools({
        tools: [webSearchTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['web_search'] },
        toolNameMapping: webSearchNameMapping,
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'web_search' }],
      });
    });

    it('should prefer the user tool name over a canonical name alias on collision', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'function',
            name: 'web_search',
            description: 'A function that happens to be named web_search',
            inputSchema: { type: 'object', properties: {} },
          },
          webSearchTool,
        ],
        toolChoice: undefined,
        allowedTools: { toolNames: ['web_search'] },
        toolNameMapping: webSearchNameMapping,
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'function', name: 'web_search' }],
      });
      expect(result.toolWarnings).toEqual([
        {
          type: 'unsupported',
          feature: 'allowedTools entry "web_search"',
          details:
            'this name is both a tool name and the provider tool name of another tool in this request; the tool with this name is allowed',
        },
      ]);
    });

    it('should not resolve a function tool by the literal name "function"', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['function'] },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'function', name: 'function' }],
      });
      expect(result.toolWarnings).toEqual([
        {
          type: 'unsupported',
          feature: 'allowedTools entry "function"',
          details:
            'the tool is not part of the tools for this request and is sent as a function tool',
        },
      ]);
    });

    describe('tools that cannot be allow-listed', () => {
      it.each([
        [
          'a deferred tool',
          {
            type: 'function',
            name: 'problem_tool',
            description: 'Deferred',
            inputSchema: { type: 'object', properties: {} },
            providerOptions: { openai: { deferLoading: true } },
          },
          'problem_tool',
          'deferred tools are not visible to tool_choice.allowed_tools; the tool is removed from the allowed tools',
        ],
        [
          'a namespaced tool',
          {
            type: 'function',
            name: 'problem_tool',
            description: 'Namespaced',
            inputSchema: { type: 'object', properties: {} },
            providerOptions: {
              openai: { namespace: { name: 'crm', description: 'CRM tools' } },
            },
          },
          'problem_tool',
          'tools inside an OpenAI tool namespace are not visible to tool_choice.allowed_tools; the tool is removed from the allowed tools',
        ],
        [
          'the tool search tool',
          {
            type: 'provider',
            id: 'openai.tool_search',
            name: 'problem_tool',
            args: {},
          },
          'problem_tool',
          'OpenAI does not support tool_search tools in tool_choice.allowed_tools; the tool is removed from the allowed tools',
        ],
      ])(
        'should drop %s from the allow-list and warn',
        async (_label, problemTool, allowedName, expectedDetails) => {
          const result = await prepareResponsesTools({
            tools: [functionTool, problemTool as any],
            toolChoice: undefined,
            allowedTools: {
              toolNames: ['get_weather', allowedName as string],
            },
          });

          expect(result.toolChoice).toEqual({
            type: 'allowed_tools',
            mode: 'auto',
            tools: [{ type: 'function', name: 'get_weather' }],
          });
          expect(result.toolWarnings).toEqual([
            {
              type: 'unsupported',
              feature: `allowedTools entry "${allowedName}"`,
              details: expectedDetails,
            },
          ]);
        },
      );

      it('should drop an unlistable provider tool referenced by its canonical name', async () => {
        const result = await prepareResponsesTools({
          tools: [
            functionTool,
            {
              type: 'provider',
              id: 'openai.tool_search',
              name: 'my_search',
              args: {},
            },
          ],
          toolChoice: undefined,
          allowedTools: { toolNames: ['get_weather', 'tool_search'] },
          toolNameMapping: {
            toProviderToolName: name =>
              name === 'my_search' ? 'tool_search' : name,
            toCustomToolName: name => name,
          },
        });

        expect(result.toolChoice).toEqual({
          type: 'allowed_tools',
          mode: 'auto',
          tools: [{ type: 'function', name: 'get_weather' }],
        });
        expect(result.toolWarnings).toEqual([
          {
            type: 'unsupported',
            feature: 'allowedTools entry "tool_search"',
            details:
              'OpenAI does not support tool_search tools in tool_choice.allowed_tools; the tool is removed from the allowed tools',
          },
        ]);
      });

      it('should drop an ambiguous canonical name when several tools share it', async () => {
        const result = await prepareResponsesTools({
          tools: [
            functionTool,
            mcpTool('alpha', 'alpha'),
            mcpTool('beta', 'beta'),
          ],
          toolChoice: undefined,
          allowedTools: { toolNames: ['get_weather', 'mcp'] },
          toolNameMapping: mcpNameMapping,
        });

        expect(result.toolChoice).toEqual({
          type: 'allowed_tools',
          mode: 'auto',
          tools: [{ type: 'function', name: 'get_weather' }],
        });
        expect(result.toolWarnings).toEqual([
          {
            type: 'unsupported',
            feature: 'allowedTools entry "mcp"',
            details:
              'several tools in this request share this provider tool name; use the tool name from the tools for this request instead',
          },
        ]);
      });

      it('should still resolve each mcp server by its own tool name', async () => {
        const result = await prepareResponsesTools({
          tools: [mcpTool('alpha', 'alpha'), mcpTool('beta', 'beta')],
          toolChoice: undefined,
          allowedTools: { toolNames: ['beta'] },
          toolNameMapping: mcpNameMapping,
        });

        expect(result.toolChoice).toEqual({
          type: 'allowed_tools',
          mode: 'auto',
          tools: [{ type: 'mcp', server_label: 'beta' }],
        });
        expect(result.toolWarnings).toEqual([]);
      });

      it('should throw when no allowed tool can be expressed', async () => {
        await expect(
          prepareResponsesTools({
            tools: [
              {
                type: 'provider',
                id: 'openai.tool_search',
                name: 'tool_search',
                args: {},
              },
              {
                type: 'function',
                name: 'deferred_tool',
                description: 'Deferred',
                inputSchema: { type: 'object', properties: {} },
                providerOptions: { openai: { deferLoading: true } },
              },
            ],
            toolChoice: undefined,
            allowedTools: { toolNames: ['tool_search', 'deferred_tool'] },
          }),
        ).rejects.toThrow(
          'allowedTools with only tools that cannot be allow-listed (tool_search, deferred_tool)',
        );
      });
    });

    it('should warn and still send an entry for a tool that is not part of the request', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['get_weather', 'typo_tool'] },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [
          { type: 'function', name: 'get_weather' },
          { type: 'function', name: 'typo_tool' },
        ],
      });
      expect(result.toolWarnings).toEqual([
        {
          type: 'unsupported',
          feature: 'allowedTools entry "typo_tool"',
          details:
            'the tool is not part of the tools for this request and is sent as a function tool',
        },
      ]);
    });

    it('should apply the tool name mapping for a tool that is not part of the request', async () => {
      const result = await prepareResponsesTools({
        tools: [functionTool],
        toolChoice: undefined,
        allowedTools: { toolNames: ['my_tool'] },
        toolNameMapping: {
          toProviderToolName: name =>
            name === 'my_tool' ? 'mapped_tool' : name,
          toCustomToolName: name => name,
        },
      });

      expect(result.toolChoice).toEqual({
        type: 'allowed_tools',
        mode: 'auto',
        tools: [{ type: 'function', name: 'mapped_tool' }],
      });
    });
  });
  describe('programmatic tool calling', () => {
    it('should serialize the hosted tool and function tool options', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.programmatic_tool_calling',
            name: 'program',
            args: {},
          },
          {
            type: 'function',
            name: 'get_inventory',
            description: 'Get inventory',
            inputSchema: {
              type: 'object',
              properties: { sku: { type: 'string' } },
              required: ['sku'],
              additionalProperties: false,
            },
            providerOptions: {
              openai: {
                allowedCallers: ['programmatic'],
                outputSchema: {
                  type: 'object',
                  properties: {
                    sku: { type: 'string' },
                    availableUnits: { type: 'number' },
                  },
                  required: ['sku', 'availableUnits'],
                  additionalProperties: false,
                },
              },
            },
          },
        ],
        toolChoice: undefined,
      });

      expect(result.tools).toEqual([
        { type: 'programmatic_tool_calling' },
        {
          type: 'function',
          name: 'get_inventory',
          description: 'Get inventory',
          parameters: {
            type: 'object',
            properties: { sku: { type: 'string' } },
            required: ['sku'],
            additionalProperties: false,
          },
          allowed_callers: ['programmatic'],
          output_schema: {
            type: 'object',
            properties: {
              sku: { type: 'string' },
              availableUnits: { type: 'number' },
            },
            required: ['sku', 'availableUnits'],
            additionalProperties: false,
          },
        },
      ]);
    });

    it('should support forcing the hosted tool', async () => {
      const result = await prepareResponsesTools({
        tools: [
          {
            type: 'provider',
            id: 'openai.programmatic_tool_calling',
            name: 'program',
            args: {},
          },
        ],
        toolChoice: { type: 'tool', toolName: 'program' },
        toolNameMapping: {
          toProviderToolName: () => 'programmatic_tool_calling',
          toCustomToolName: () => 'program',
        },
      });

      expect(result.toolChoice).toEqual({
        type: 'programmatic_tool_calling',
      });
    });
  });
});
