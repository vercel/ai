import { EmbeddingModelV2 } from '../../embedding-model/v2/embedding-model-v2';
import { ImageModelV2 } from '../../image-model/v2/image-model-v2';
import { LanguageModelV2 } from '../../language-model/v2/language-model-v2';

/**
 * Provider for language, text embedding, and image generation models.
 */
export interface ProviderV2 {
  /**
Returns the language model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {LanguageModel} The language model associated with the id

@throws {NoSuchModelError} If no such model exists.
   */
  languageModel(modelId: string): LanguageModelV2;

  /**
Returns the text embedding model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {LanguageModel} The language model associated with the id

@throws {NoSuchModelError} If no such model exists.
   */
  textEmbeddingModel(modelId: string): EmbeddingModelV2<string>;

  /**
Returns the image model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {ImageModel} The image model associated with the id
*/
  imageModel(modelId: string): ImageModelV2;
}
