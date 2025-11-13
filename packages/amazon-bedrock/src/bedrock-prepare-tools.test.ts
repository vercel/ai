import { describe, it, expect } from 'vitest';
import { prepareTools } from './bedrock-prepare-tools';

describe('prepareTools', () => {
  it('should return empty toolConfig when tools are null', async () => {
    const result = await prepareTools({
      tools: undefined,
      modelId: 'us.amazon.nova-premier-v1:0',
    });
    expect(result).toEqual({
      toolConfig: {},
      additionalTools: undefined,
      toolWarnings: [],
      betas: new Set(),
    });
  });

  it('should return empty toolConfig when tools are empty', async () => {
    const result = await prepareTools({
      tools: [],
      modelId: 'us.amazon.nova-premier-v1:0',
    });
    expect(result).toEqual({
      toolConfig: {},
      additionalTools: undefined,
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
      modelId: 'us.amazon.nova-premier-v1:0',
    });

    expect(result.toolConfig.tools).toEqual([
      {
        toolSpec: {
          name: 'testFunction',
          description: 'A test function',
          inputSchema: {
            json: { type: 'object', properties: {} },
          },
        },
      },
    ]);
    expect(result.toolWarnings).toEqual([]);
  });

  describe('Nova provider-defined tools', () => {
    it('should correctly prepare nova_grounding tool', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'nova.nova_grounding',
            name: 'nova_grounding',
            args: {},
          },
        ],
        modelId: 'us.amazon.nova-premier-v1:0',
      });

      expect(result.toolConfig.tools).toEqual([
        {
          systemTool: {
            name: 'nova_grounding',
          },
        },
      ]);
      expect(result.toolWarnings).toEqual([]);
      expect(result.betas.size).toBe(0);
    });

    it('should warn when mixing Nova tools with function tools and exclude function tools', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'nova.nova_grounding',
            name: 'nova_grounding',
            args: {},
          },
          {
            type: 'function',
            name: 'testFunction',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        modelId: 'us.amazon.nova-premier-v1:0',
      });

      expect(result.toolWarnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'tools',
        details:
          'Mixed Nova provider-defined tools and standard function tools are not supported in a single call to Bedrock. Only Nova tools will be used.',
      });

      // Verify that only Nova tools are included, function tools are excluded
      expect(result.toolConfig.tools).toEqual([
        {
          systemTool: {
            name: 'nova_grounding',
          },
        },
      ]);
      expect(result.toolConfig.tools?.length).toBe(1);
    });

    it('should not use Nova tools with non-Nova models', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'nova.nova_grounding',
            name: 'nova_grounding',
            args: {},
          },
        ],
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });

      expect(result.toolConfig.tools).toBeUndefined();
      expect(result.toolWarnings).toContainEqual({
        type: 'unsupported-tool',
        tool: {
          type: 'provider-defined',
          id: 'nova.nova_grounding',
          name: 'nova_grounding',
          args: {},
        },
      });
    });
  });

  describe('Anthropic provider-defined tools', () => {
    it('should warn when mixing Anthropic tools with function tools and exclude function tools', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.bash_20241022',
            name: 'bash',
            args: {},
          },
          {
            type: 'function',
            name: 'testFunction',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });

      expect(result.toolWarnings).toContainEqual({
        type: 'unsupported-setting',
        setting: 'tools',
        details:
          'Mixed Anthropic provider-defined tools and standard function tools are not supported in a single call to Bedrock. Only Anthropic tools will be used.',
      });

      // Verify that only Anthropic tools are included, function tools are excluded
      expect(result.toolConfig.tools).toHaveLength(1);
      expect(result.toolConfig.tools?.[0]).toHaveProperty('toolSpec');
      expect((result.toolConfig.tools?.[0] as any).toolSpec?.name).toBe('bash');
    });

    it('should filter out web_search_20250305 and add warning', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'provider-defined',
            id: 'anthropic.web_search_20250305',
            name: 'web_search',
            args: {},
          },
        ],
        modelId: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
      });

      expect(result.toolConfig.tools).toBeUndefined();
      expect(result.toolWarnings).toContainEqual({
        type: 'unsupported-tool',
        tool: {
          type: 'provider-defined',
          id: 'anthropic.web_search_20250305',
          name: 'web_search',
          args: {},
        },
        details:
          'The web_search_20250305 tool is not supported on Amazon Bedrock.',
      });
    });
  });
});
