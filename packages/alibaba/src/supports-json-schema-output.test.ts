import { describe, expect, it } from 'vitest';
import { supportsJsonSchemaOutput } from './supports-json-schema-output';

describe('supportsJsonSchemaOutput', () => {
  it.each([
    'qwen3.7-plus',
    'qwen3.7-plus-2026-09-01',
    'qwen3.7-flash',
    'qwen3.7-max',
    'qwen3.8-max',
    'qwen3.8-flash',
    'qwen3.8-flash-latest',
  ])('returns true for %s', modelId => {
    expect(supportsJsonSchemaOutput(modelId)).toBe(true);
  });

  it.each([
    'qwen-plus',
    'qwen3-max',
    'qwen3.6-plus',
    'qwen3.8-plus',
    'qwen3.8-maximal',
    'deepseek-v4-pro',
    'deepseek-v4.1-flash',
    'kimi-k3',
    'glm-5.1',
  ])('returns false for %s', modelId => {
    expect(supportsJsonSchemaOutput(modelId)).toBe(false);
  });
});
