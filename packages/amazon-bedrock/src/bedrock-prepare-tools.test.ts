import { describe, it, expect } from 'vitest';
import { prepareTools } from './bedrock-prepare-tools';

describe('prepareTools', () => {
  describe('strict mode for function tools', () => {
    it('should pass through strict mode when strict is true', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
            strict: true,
          },
        ],
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      });

      expect(result.toolConfig.tools).toEqual([
        {
          toolSpec: {
            name: 'testFunction',
            description: 'A test function',
            strict: true,
            inputSchema: {
              json: { type: 'object', properties: {} },
            },
          },
        },
      ]);
    });

    it('should pass through strict mode when strict is false', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
            strict: false,
          },
        ],
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      });

      expect(result.toolConfig.tools).toEqual([
        {
          toolSpec: {
            name: 'testFunction',
            description: 'A test function',
            strict: false,
            inputSchema: {
              json: { type: 'object', properties: {} },
            },
          },
        },
      ]);
    });

    it('should not include strict when strict is undefined', async () => {
      const result = await prepareTools({
        tools: [
          {
            type: 'function',
            name: 'testFunction',
            description: 'A test function',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      });

      const toolSpec = (result.toolConfig.tools![0] as any).toolSpec;
      expect(toolSpec).not.toHaveProperty('strict');
      expect(toolSpec.name).toBe('testFunction');
    });

    it('should pass through strict mode for multiple tools with different strict settings', async () => {
      const result = await prepareTools({
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
        modelId: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      });

      const tools = result.toolConfig.tools!;
      expect((tools[0] as any).toolSpec.strict).toBe(true);
      expect((tools[1] as any).toolSpec.strict).toBe(false);
      expect((tools[2] as any).toolSpec).not.toHaveProperty('strict');
    });
  });
});
