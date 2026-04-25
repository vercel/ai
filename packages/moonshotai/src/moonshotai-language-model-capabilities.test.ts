import { describe, expect, it } from 'vitest';
import { getMoonshotAILanguageModelCapabilities } from './moonshotai-language-model-capabilities';

describe('getMoonshotAILanguageModelCapabilities', () => {
  it.each([
    ['kimi-k2.5', true],
    ['kimi-k2.5-turbo', true],
    ['kimi-k2.5-custom-suffix', true],
    ['kimi-k2', true],
    ['kimi-k2-thinking', true],
    ['moonshot-v1-8k', false],
    ['moonshot-v1-32k', false],
    ['moonshot-v1-128k', false],
    ['custom-model-id', false],
  ])(
    'supportsStructuredOutputs for %s is %s',
    (modelId, expectedSupportsStructuredOutputs) => {
      expect(
        getMoonshotAILanguageModelCapabilities(modelId)
          .supportsStructuredOutputs,
      ).toBe(expectedSupportsStructuredOutputs);
    },
  );
});
