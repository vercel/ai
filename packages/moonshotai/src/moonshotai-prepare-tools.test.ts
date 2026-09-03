import { describe, expect, it } from 'vitest';
import { prepareTools } from './moonshotai-prepare-tools';

const tools = [
  {
    type: 'function' as const,
    name: 'testFunction',
    description: 'Test function',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

describe('prepareTools', () => {
  it.each(['kimi-k2.6', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed'] as const)(
    'should omit required tool choice and warn for %s',
    modelId => {
      const result = prepareTools({
        tools,
        toolChoice: { type: 'required' },
        modelId,
      });

      expect(result.toolChoice).toBeUndefined();
      expect(result.toolWarnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: `tool choice "required" for model "${modelId}"`,
          details:
            'Moonshot AI rejects required tool choice for this model. The setting has been omitted; use "auto" or select a specific tool instead.',
        },
      ]);
    },
  );

  it.each(['kimi-k3', 'custom-kimi-model'] as const)(
    'should preserve required tool choice for %s',
    modelId => {
      const result = prepareTools({
        tools,
        toolChoice: { type: 'required' },
        modelId,
      });

      expect(result.toolChoice).toBe('required');
      expect(result.toolWarnings).toStrictEqual([]);
    },
  );

  it.each([
    [{ type: 'auto' }, 'auto'],
    [{ type: 'none' }, 'none'],
    [
      { type: 'tool', toolName: 'testFunction' },
      { type: 'function', function: { name: 'testFunction' } },
    ],
  ] as const)(
    'should preserve tool choice %j for unsupported required-tool-choice models',
    (toolChoice, expectedToolChoice) => {
      const result = prepareTools({
        tools,
        toolChoice,
        modelId: 'kimi-k2.6',
      });

      expect(result.toolChoice).toStrictEqual(expectedToolChoice);
      expect(result.toolWarnings).toStrictEqual([]);
    },
  );
});
