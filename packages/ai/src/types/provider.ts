import { EmbeddingModel } from './embedding-model';
import { LanguageModel } from './language-model';
import { ImageModel } from './image-model';

/**
 * Provider for language, text embedding, and image models.
 */
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

  /**
  Returns the image model with the given id.
  The model id is then passed to the provider function to get the model.

  @param {string} id - The id of the model to return.

  @returns {ImageModel} The image model associated with the id
  */
  imageModel(modelId: string): ImageModel;
};
