import { describe, expect, it } from 'vitest';
import { mapAmazonBedrockFinishReason } from './map-amazon-bedrock-finish-reason';

describe('mapAmazonBedrockFinishReason', () => {
  it('maps max_tokens to length', () => {
    expect(mapAmazonBedrockFinishReason('max_tokens')).toBe('length');
  });

  it('maps model_context_window_exceeded to length', () => {
    expect(mapAmazonBedrockFinishReason('model_context_window_exceeded')).toBe(
      'length',
    );
  });

  it('maps unknown stop reasons to other', () => {
    expect(
      mapAmazonBedrockFinishReason('something_new' as unknown as 'stop'),
    ).toBe('other');
  });
});
