import { MockLanguageModelV2 } from '../test/mock-language-model-v2';
import { resolveLanguageModel } from './resolve-language-model';

describe('resolveLanguageModel', () => {
  describe('when a language model v2 is provided', () => {
    it('should return the language model v2', () => {
      const resolvedModel = resolveLanguageModel(
        new MockLanguageModelV2({
          provider: 'test-provider',
          modelId: 'test-model-id',
        }),
      );

      expect(resolvedModel.provider).toBe('test-provider');
      expect(resolvedModel.modelId).toBe('test-model-id');
    });
  });
});
