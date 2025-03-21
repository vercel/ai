import { EmbeddingModelV1 } from '../../embedding-model/v1/embedding-model-v1';
import { ImageModelV1 } from '../../image-model/v1/image-model-v1';
import { LanguageModelV1 } from '../../language-model/v1/language-model-v1';

/**
 * Provider for language, text embedding, and image generation models.
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

  /**
Returns the image model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {ImageModel} The image model associated with the id
*/
  readonly imageModel?: (modelId: string) => ImageModelV1;
}
