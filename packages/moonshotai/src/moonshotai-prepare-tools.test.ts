import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { prepareTools } from './moonshotai-prepare-tools';

const tools: NonNullable<LanguageModelV4CallOptions['tools']> = [
  {
    type: 'function',
    name: 'getWeather',
    description: 'Get the weather in a location',
    inputSchema: {
      type: 'object',
      properties: { location: { type: 'string' } },
      required: ['location'],
    },
  },
];

describe('prepareTools', () => {
  it.each(['kimi-k2.6', 'kimi-k2.7'] as const)(
    'omits required tool choice for %s',
    modelFamily => {
      const result = prepareTools({
        modelFamily,
        tools,
        toolChoice: { type: 'required' },
      });

      expect(result.toolChoice).toBeUndefined();
      expect(result.tools).toHaveLength(1);
      expect(result.toolWarnings).toStrictEqual([
        {
          type: 'unsupported',
          feature: 'toolChoice',
          details: `Required tool choice is not supported by ${modelFamily} models and has been omitted.`,
        },
      ]);
    },
  );

  it.each(['kimi-k3', 'unknown'] as const)(
    'preserves required tool choice for %s',
    modelFamily => {
      const result = prepareTools({
        modelFamily,
        tools,
        toolChoice: { type: 'required' },
      });

      expect(result.toolChoice).toBe('required');
      expect(result.toolWarnings).toStrictEqual([]);
    },
  );

  it.each(['auto', 'none'] as const)(
    'preserves %s tool choice for Kimi K2.6',
    type => {
      const result = prepareTools({
        modelFamily: 'kimi-k2.6',
        tools,
        toolChoice: { type },
      });

      expect(result.toolChoice).toBe(type);
      expect(result.toolWarnings).toStrictEqual([]);
    },
  );
});
