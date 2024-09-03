import { EmbeddingModel } from './embedding-model';
import { LanguageModel } from './language-model';

/**
 * Provider for language and text embedding models.
 */
// NOTE: this matches the ProviderV1 interface in @ai-sdk/provider
// It is re-implemented to prevent the following error:
// "This is likely not portable. A type annotation is necessary.ts(2742)"
export type Provider = {
  /**
  Returns the language model with the given id.
  The model id is then passed to the provider function to get the model.

  @param {string} id - The id of the model to return.

  @returns {LanguageModel} The language model associated with the id

  @throws {NoSuchModelError} If no such model exists.
     */
  languageModel(modelId: string): LanguageModel;

  /**
  Returns the text embedding model with the given id.
  The model id is then passed to the provider function to get the model.

  @param {string} id - The id of the model to return.

  @returns {LanguageModel} The language model associated with the id

  @throws {NoSuchModelError} If no such model exists.
     */
  textEmbeddingModel(modelId: string): EmbeddingModel<string>;
};
