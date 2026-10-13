import { describe, expect, it } from 'vitest';
import { supportsPreservedThinking } from './supports-preserved-thinking';

describe('supportsPreservedThinking', () => {
  it('should support models from Alibaba preserved-thinking documentation', () => {
    expect(supportsPreservedThinking('qwen3.7-max')).toBe(true);
    expect(supportsPreservedThinking('qwen3.8-max')).toBe(true);
    expect(supportsPreservedThinking('qwen3.7-max-2026-06-08')).toBe(true);
  });

  it('should not support other models', () => {
    expect(supportsPreservedThinking('qwen3-max')).toBe(false);
    expect(supportsPreservedThinking('qwen-plus')).toBe(false);
    expect(supportsPreservedThinking('qwq-plus')).toBe(false);
  });
});
