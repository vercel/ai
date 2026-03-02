import { EmbeddingModelV3 } from '../../embedding-model/v3/embedding-model-v3';
import { ImageModelV3 } from '../../image-model/v3/image-model-v3';
import { LanguageModelV4 } from '../../language-model/v4/language-model-v4';
import { RerankingModelV3 } from '../../reranking-model/v3/reranking-model-v3';
import { SpeechModelV3 } from '../../speech-model/v3/speech-model-v3';
import { TranscriptionModelV3 } from '../../transcription-model/v3/transcription-model-v3';

/**
 * Provider for language, text embedding, and image generation models.
 */
export interface ProviderV4 {
  readonly specificationVersion: 'v4';

  /**
   * Returns the language model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {LanguageModelV4} The language model associated with the id
   *
   * @throws {NoSuchModelError} If no such model exists.
   */
  languageModel(modelId: string): LanguageModelV4;

  /**
   * Returns the text embedding model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {EmbeddingModelV3} The embedding model associated with the id
   *
   * @throws {NoSuchModelError} If no such model exists.
   */
  embeddingModel(modelId: string): EmbeddingModelV3;

  /**
   * Returns the image model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {ImageModelV3} The image model associated with the id
   */
  imageModel(modelId: string): ImageModelV3;

  /**
   * Returns the transcription model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {TranscriptionModelV3} The transcription model associated with the id
   */
  transcriptionModel?(modelId: string): TranscriptionModelV3;

  /**
   * Returns the speech model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {SpeechModelV3} The speech model associated with the id
   */
  speechModel?(modelId: string): SpeechModelV3;

  /**
   * Returns the reranking model with the given id.
   * The model id is then passed to the provider function to get the model.
   *
   * @param {string} modelId - The id of the model to return.
   *
   * @returns {RerankingModelV3} The reranking model associated with the id
   *
   * @throws {NoSuchModelError} If no such model exists.
   */
  rerankingModel?(modelId: string): RerankingModelV3;
}
