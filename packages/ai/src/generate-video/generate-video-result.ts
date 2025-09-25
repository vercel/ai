import { GeneratedFile } from '../generate-text';
import { VideoGenerationWarning } from '../types/video-model';
import { VideoModelResponseMetadata } from '../types/video-model-response-metadata';

/**
The result of a `generateVideo` call.
It contains the videos and additional information.
 */
export interface GenerateVideoResult {
  /**
The first video that was generated.
   */
  readonly video: GeneratedFile;

  /**
The videos that were generated.
     */
  readonly videos: Array<GeneratedFile>;

  /**
Warnings for the call, e.g. unsupported settings.
     */
  readonly warnings: Array<VideoGenerationWarning>;

  /**
Response metadata from the provider. There may be multiple responses if we made multiple calls to the model.
   */
  readonly responses: Array<VideoModelResponseMetadata>;

  /**
   * Provider-specific metadata. They are passed through from the provider to the AI SDK and enable provider-specific
   * results that can be fully encapsulated in the provider.
   */
  readonly providerMetadata: Record<string, { videos: unknown[] }>;
}


