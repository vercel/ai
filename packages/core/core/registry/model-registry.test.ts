import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { InvalidModelIdError } from './invalid-model-id-error';
import { createModelRegistry } from './model-registry';
import { NoSuchModelError } from './no-such-model-error';
import { NoSuchProviderError } from './no-such-provider-error';

it('should return language model from provider', () => {
  const model = new MockLanguageModelV1();

  const modelRegistry = createModelRegistry({
    provider: id => {
      expect(id).toEqual('model');
      return model;
    },
  });

  expect(modelRegistry.languageModel('provider:model')).toEqual(model);
});

it('should throw NoSuchProviderError if provider does not exist', () => {
  const modelRegistry = createModelRegistry({});

  expect(() => modelRegistry.languageModel('provider:model')).toThrowError(
    NoSuchProviderError,
  );
});

it('should throw NoSuchModelError if provider does not return a model', () => {
  const modelRegistry = createModelRegistry({
    provider: () => null as any,
  });

  expect(() => modelRegistry.languageModel('provider:model')).toThrowError(
    NoSuchModelError,
  );
});

it("should throw InvalidModelIdError if model id doesn't contain a colon", () => {
  const modelRegistry = createModelRegistry({});

  expect(() => modelRegistry.languageModel('model')).toThrowError(
    InvalidModelIdError,
  );
});
