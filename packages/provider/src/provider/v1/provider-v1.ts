import { EmbeddingModelV1 } from '../../embedding-model/v1/embedding-model-v1';
import { LanguageModelV1 } from '../../language-model/v1/language-model-v1';

/**
 * Provider for language and text embedding models.
 */
export interface ProviderV1 {
  /**
Returns the language model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {LanguageModel} The language model associated with the id

@throws {NoSuchModelError} If no such model exists.
   */
  languageModel(modelId: string): LanguageModelV1;

  /**
Returns the text embedding model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {LanguageModel} The language model associated with the id

@throws {NoSuchModelError} If no such model exists.
   */
  textEmbeddingModel(modelId: string): EmbeddingModelV1<string>;
}
