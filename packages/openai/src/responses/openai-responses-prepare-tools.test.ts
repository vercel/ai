import { prepareResponsesTools } from './openai-responses-prepare-tools';

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

  describe('provider-defined toolChoice passthrough', () => {
    it.each([['none'], ['auto'], ['required']])(
      'should passthrough primitive toolChoice %s',
      primitive => {
        const result = prepareResponsesTools({
          tools: [
            {
              type: 'provider-defined',
              id: 'openai.code_interpreter',
              name: 'code_interpreter',
              args: {},
            },
          ],
          toolChoice: { type: 'provider-defined', toolChoice: primitive },
          strictJsonSchema: false,
        });

        expect(result.toolChoice).toEqual(primitive);
        expect(result.toolWarnings).toEqual([]);
      },
    );

    it('should passthrough built-in type selection: code_interpreter', () => {
      const choice = { type: 'code_interpreter' } as const;
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: { type: 'provider-defined', toolChoice: choice },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toEqual(choice);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should passthrough function selection', () => {
      const choice = { type: 'function', name: 'my_function' } as const;
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: { type: 'provider-defined', toolChoice: choice },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toEqual(choice);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should passthrough custom tool selection', () => {
      const choice = { type: 'custom', name: 'my_custom_tool' } as const;
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: { type: 'provider-defined', toolChoice: choice },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toEqual(choice);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should passthrough MCP selection', () => {
      const choice = {
        type: 'mcp',
        server_label: 'deepwiki',
        name: 'search',
      } as const;
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: { type: 'provider-defined', toolChoice: choice },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toEqual(choice);
      expect(result.toolWarnings).toEqual([]);
    });

    it('should passthrough allowed_tools selection', () => {
      const choice = {
        type: 'allowed_tools',
        mode: 'auto',
        tools: [
          { type: 'function', name: 'get_weather' },
          { type: 'mcp', server_label: 'deepwiki' },
          { type: 'image_generation' },
        ],
      } as const;
      const result = prepareResponsesTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'openai.code_interpreter',
            name: 'code_interpreter',
            args: {},
          },
        ],
        toolChoice: { type: 'provider-defined', toolChoice: choice },
        strictJsonSchema: false,
      });

      expect(result.toolChoice).toEqual(choice);
      expect(result.toolWarnings).toEqual([]);
    });
  });
});
