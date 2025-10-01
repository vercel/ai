import { EmbeddingModelV2 } from '../../embedding-model/v2/embedding-model-v2';
import { ImageModelV2 } from '../../image-model/v2/image-model-v2';
import { LanguageModelV2 } from '../../language-model/v2/language-model-v2';
import { SpeechModelV2 } from '../../speech-model/v2/speech-model-v2';
import { TranscriptionModelV2 } from '../../transcription-model/v2/transcription-model-v2';
import { RerankingModelV3 } from '../../reranking-model/v3/reranking-model-v3';

/**
 * Provider for language, text embedding, and image generation models.
 */
export interface ProviderV2<VALUE = string> {
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
  textEmbeddingModel(modelId: string): EmbeddingModelV2<VALUE>;

  /**
Returns the image model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {ImageModel} The image model associated with the id
*/
  imageModel(modelId: string): ImageModelV2;

  /**
Returns the transcription model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {TranscriptionModel} The transcription model associated with the id
  */
  transcriptionModel?(modelId: string): TranscriptionModelV2;

  /**
Returns the speech model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {SpeechModel} The speech model associated with the id
  */
  speechModel?(modelId: string): SpeechModelV2;

  /**
Returns the reranking model with the given id.
The model id is then passed to the provider function to get the model.

@param {string} modelId - The id of the model to return.

@returns {RerankingModel} The reranking model associated with the id

@throws {NoSuchModelError} If no such model exists.
   */
  rerankingModel?(modelId: string): RerankingModelV3<VALUE>;
}
