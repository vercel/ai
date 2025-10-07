import { prepareResponsesTools } from './openai-responses-prepare-tools';
import { describe, it, expect } from 'vitest';

describe('prepareResponsesTools', () => {
  describe('code interpreter', () => {
    it('should prepare code interpreter tool with no container (auto mode)', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
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

    it('should prepare code interpreter tool with string container ID', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: 'container-123',
            },
          },
        ],
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

    it('should prepare code interpreter tool with file IDs container', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: ['file-1', 'file-2', 'file-3'],
              },
            },
          },
        ],
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

    it('should prepare code interpreter tool with empty file IDs array', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: [],
              },
            },
          },
        ],
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

    it('should prepare code interpreter tool with undefined file IDs', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: {
                fileIds: undefined,
              },
            },
          },
        ],
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

    it('should handle tool choice selection with code interpreter', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
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

    it('should handle multiple tools including code interpreter', () => {
      const result = prepareResponsesTools({
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
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {
              container: 'my-container',
            },
          },
        ],
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
    it('should prepare image_generation tool with all options', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
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

    it('should support tool choice selection for image_generation', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
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
    it('should prepare local_shell tool', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.local_shell',
            name: 'local_shell',
            args: {},
          },
        ],
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
});
