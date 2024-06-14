import { MockLanguageModelV1 } from '../test/mock-language-model-v1';
import { InvalidModelIdError } from './invalid-model-id-error';
import { NoSuchModelError } from './no-such-model-error';
import { NoSuchProviderError } from './no-such-provider-error';
import { experimental_createProviderRegistry } from './provider-registry';

it('should return language model from provider', () => {
  const model = new MockLanguageModelV1();

  const modelRegistry = experimental_createProviderRegistry({
    provider: id => {
      expect(id).toEqual('model');
      return model;
    },
  });

  expect(modelRegistry.languageModel('provider:model')).toEqual(model);
});

it('should throw NoSuchProviderError if provider does not exist', () => {
  const registry = experimental_createProviderRegistry({});

  expect(() => registry.languageModel('provider:model')).toThrowError(
    NoSuchProviderError,
  );
});

it('should throw NoSuchModelError if provider does not return a model', () => {
  const registry = experimental_createProviderRegistry({
    provider: () => null as any,
  });

  expect(() => registry.languageModel('provider:model')).toThrowError(
    NoSuchModelError,
  );
});

it("should throw InvalidModelIdError if model id doesn't contain a colon", () => {
  const registry = experimental_createProviderRegistry({});

  expect(() => registry.languageModel('model')).toThrowError(
    InvalidModelIdError,
  );
});
