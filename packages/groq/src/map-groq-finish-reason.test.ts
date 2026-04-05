import { describe, expect, it } from 'vitest';
import { mapGroqFinishReason } from './map-groq-finish-reason';

describe('mapGroqFinishReason', () => {
  it('maps tool_calls to tool-calls by default', () => {
    expect(mapGroqFinishReason('tool_calls')).toBe('tool-calls');
    expect(mapGroqFinishReason('function_call')).toBe('tool-calls');
  });

  it('maps tool_calls to stop when structured output came from synthetic json tool only', () => {
    expect(
      mapGroqFinishReason('tool_calls', { isJsonResponseFromTool: true }),
    ).toBe('stop');
    expect(
      mapGroqFinishReason('function_call', { isJsonResponseFromTool: true }),
    ).toBe('stop');
  });
});
