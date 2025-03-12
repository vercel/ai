import { LanguageModelV1ProviderMetadata } from './language-model-v1-provider-metadata';

/**
 * A source that has been used as input to generate the response.
 */
export type LanguageModelV1Source =
  | {
      /**
       * A URL source. This is return by web search RAG models.
       */
      sourceType: 'url';

      /**
       * The ID of the source.
       */
      id: string;

      /**
       * The URL of the source.
       */
      url: string;

      /**
       * The title of the source.
       */
      title?: string;

      /**
       * Additional provider metadata for the source.
       */
      providerMetadata?: LanguageModelV1ProviderMetadata;
    }
  | {
      /**
       * A file source. This is returned by file search RAG models.
       */
      sourceType: 'file';

      /**
       * The ID of the source.
       */
      id: string;

      /**
       * The ID of the file.
       */
      fileId: string;

      /**
       * The name of the file.
       */
      filename: string;

      /**
       * Additional provider metadata for the source.
       */
      providerMetadata?: LanguageModelV1ProviderMetadata;
    };
