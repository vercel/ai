import { describe, expect, it } from 'vitest';
import { mapMistralFinishReason } from './map-mistral-finish-reason';

describe('mapMistralFinishReason', () => {
  it('maps error to error', () => {
    expect(mapMistralFinishReason('error')).toBe('error');
  });

  it('maps unknown finish reasons to other', () => {
    expect(mapMistralFinishReason('unknown')).toBe('other');
  });
});
