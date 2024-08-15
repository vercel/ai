import { EmbeddingModel } from '../types/embedding-model';
import { LanguageModel } from '../types/language-model';

/**
 * Provides for language and text embedding models.
 */
export interface experimental_Provider {
  /**
Returns the language model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  languageModel?: (modelId: string) => LanguageModel;

  /**
Returns the text embedding model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.
   */
  textEmbeddingModel?: (modelId: string) => EmbeddingModel<string>;

  /**
Returns the text embedding model with the given id in the format `providerId:modelId`.
The model id is then passed to the provider function to get the model.

@param {string} id - The id of the model to return.

@throws {NoSuchModelError} If no model with the given id exists.
@throws {NoSuchProviderError} If no provider with the given id exists.

@returns {LanguageModel} The language model associated with the id.

@deprecated use `textEmbeddingModel` instead.
   */
  textEmbedding?: (modelId: string) => EmbeddingModel<string>;
}
