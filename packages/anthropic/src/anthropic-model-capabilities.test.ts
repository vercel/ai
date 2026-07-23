import { describe, expect, it } from 'vitest';
import { getModelCapabilities } from './anthropic-messages-language-model';

describe('getModelCapabilities', () => {
  it('uses current-generation capabilities for unknown Claude models', () => {
    expect(getModelCapabilities('claude-future-9')).toEqual({
      maxOutputTokens: 128000,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      isKnownModel: false,
    });
    expect(
      getModelCapabilities('us.anthropic.claude-future-9-20990101-v1:0'),
    ).toEqual({
      maxOutputTokens: 128000,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: true,
      isKnownModel: false,
    });
  });

  it.each([
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
    'us.anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-v2:1',
    'anthropic.claude-instant-v1',
  ])(
    'retains conservative capabilities for legacy Claude model %s',
    modelId => {
      expect(getModelCapabilities(modelId)).toEqual({
        maxOutputTokens: 4096,
        supportsStructuredOutput: false,
        rejectsSamplingParameters: false,
        isKnownModel: false,
      });
    },
  );

  it('matches known models before the forward-compatible fallback', () => {
    expect(getModelCapabilities('claude-opus-4-5')).toEqual({
      maxOutputTokens: 64000,
      supportsStructuredOutput: true,
      rejectsSamplingParameters: false,
      isKnownModel: true,
    });
  });

  it('retains conservative capabilities for unknown non-Claude models', () => {
    expect(getModelCapabilities('third-party-future-model')).toEqual({
      maxOutputTokens: 4096,
      supportsStructuredOutput: false,
      rejectsSamplingParameters: false,
      isKnownModel: false,
    });
  });
});
