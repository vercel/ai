import { describe, it, expect } from 'vitest';
import { mapAdaptiveFinishReason } from './map-adaptive-finish-reason';

describe('mapAdaptiveFinishReason', () => {
  it('should map stop', () => {
    expect(mapAdaptiveFinishReason('stop')).toBe('stop');
  });
  it('should map length', () => {
    expect(mapAdaptiveFinishReason('length')).toBe('length');
  });
  it('should map content_filter', () => {
    expect(mapAdaptiveFinishReason('content_filter')).toBe('content-filter');
  });
  it('should map tool_calls', () => {
    expect(mapAdaptiveFinishReason('tool_calls')).toBe('tool-calls');
  });
  it('should map unknown/undefined', () => {
    expect(mapAdaptiveFinishReason('something-else')).toBe('unknown');
    expect(mapAdaptiveFinishReason(undefined)).toBe('unknown');
  });
});
