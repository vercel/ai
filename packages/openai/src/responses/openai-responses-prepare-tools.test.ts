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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: { type: 'auto', file_ids: undefined },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: 'container-123',
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: { type: 'auto', file_ids: ['file-1', 'file-2', 'file-3'] },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: { type: 'auto', file_ids: [] },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: { type: 'auto', file_ids: undefined },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'code_interpreter',
          container: { type: 'auto', file_ids: undefined },
        },
      ]);
      expect(result.toolChoice).toEqual({
        type: 'code_interpreter',
      });
      expect(result.toolWarnings).toEqual([]);
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

      expect(result.tools).toEqual([
        {
          type: 'function',
          name: 'testFunction',
          description: 'A test function',
          parameters: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
          strict: true,
        },
        {
          type: 'code_interpreter',
          container: 'my-container',
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
    });
  });

  describe('mcp', () => {
    it('should prepare mcp tool with only server url', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.mcp',
            name: 'mcp123',
            args: {
              serverUrl: 'https://mcp.server.com',
              serverLabel: 'a_label',
            },
          },
        ],
        strictJsonSchema: false,
      });

      expect(result.tools).toEqual([
        {
          type: 'mcp',
          server_url: 'https://mcp.server.com',
          server_label: 'a_label',
          server_description: undefined,
          require_approval: undefined,
          headers: undefined,
          connector_id: undefined,
          allowed_tools: undefined,
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should prepare mcp tool with valid allowed tools array', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.mcp',
            name: 'mcp123',
            args: {
              serverUrl: 'https://mcp.server.com',
              serverLabel: 'a_label',
              allowedTools: ['wrench'],
            },
          },
        ],
        strictJsonSchema: false,
      });

      expect(result.tools).toEqual([
        {
          type: 'mcp',
          server_url: 'https://mcp.server.com',
          server_label: 'a_label',
          server_description: undefined,
          require_approval: undefined,
          headers: undefined,
          connector_id: undefined,
          allowed_tools: ['wrench'],
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should prepare mcp tool with valid allowed tools object', () => {
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.mcp',
            name: 'mcp123',
            args: {
              serverUrl: 'https://mcp.server.com',
              serverLabel: 'a_label',
              allowedTools: {
                readOnly: true,
                toolNames: ['wrench'],
              },
            },
          },
        ],
        strictJsonSchema: false,
      });

      expect(result.tools).toEqual([
        {
          type: 'mcp',
          server_url: 'https://mcp.server.com',
          server_label: 'a_label',
          server_description: undefined,
          require_approval: undefined,
          headers: undefined,
          connector_id: undefined,
          allowed_tools: {
            read_only: true,
            tool_names: ['wrench'],
          },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should throw with error if server url and provider id missing', () => {
      expect(() =>
        prepareResponsesTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.mcp',
              name: 'mcp123',
              args: {
                serverLabel: 'a_label',
              },
            },
          ],
          strictJsonSchema: false,
        }),
      ).toThrowError('Either serverUrl or connectorId must be provided');
    });

    it('should throw with error if serverUrl and connectorId are both provided', () => {
      expect(() =>
        prepareResponsesTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.mcp',
              name: 'mcp123',
              args: {
                serverLabel: 'a_label',
                serverUrl: 'https://www.mcp.com/mcp',
                connectorId: 'connector_123',
              },
            },
          ],
          strictJsonSchema: false,
        }),
      ).toThrowError('Only one of serverUrl or connectorId must be provided');
    });

    it('should have warnings if allowed tools contains invalid schema', () => {
      expect(() =>
        prepareResponsesTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.mcp',
              name: 'mcp123',
              args: {
                serverUrl: 'https://www.mcp.com/mcp',
                serverLabel: 'a_label',
                allowedTools: [false],
              },
            },
          ],
          strictJsonSchema: false,
        }),
      ).toThrowError();
    });
  });
});
