import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { ModelRegistry } from './model-registry';
import { NoSuchModelError } from './no-such-model-error';

describe('language models', () => {
  it('should return registered language model', () => {
    const modelRegistry = new ModelRegistry();

    const model = new MockLanguageModelV1();

    modelRegistry.registerLanguageModel({ id: 'test', model });

    expect(modelRegistry.languageModel('test')).toEqual(model);
  });

  it("should throw NoSuchModelError if language model doesn't exist", () => {
    const modelRegistry = new ModelRegistry();

    expect(() => modelRegistry.languageModel('test')).toThrowError(
      NoSuchModelError,
    );
  });
});

describe('language model providers', () => {
  it('should return language model from provider', () => {
    const modelRegistry = new ModelRegistry();

    const model = new MockLanguageModelV1();

    modelRegistry.registerLanguageModelProvider({
      prefix: 'provider',
      provider: id => {
        expect(id).toEqual('model');
        return model;
      },
    });

    expect(modelRegistry.languageModel('provider:model')).toEqual(model);
  });
});
