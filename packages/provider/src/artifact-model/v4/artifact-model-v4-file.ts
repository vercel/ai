import type { SharedV4ProviderOptions } from '../../shared';

/**
 * A file supplied to an artifact model.
 */
export type ArtifactModelV4File =
  | {
      type: 'file';

      /**
       * File data as a base64-encoded string or binary data.
       */
      data: string | Uint8Array;

      /**
       * The IANA media type of the file.
       */
      mediaType: string;

      /**
       * Original filename, when available.
       */
      filename?: string;

      /**
       * Provider-independent hint describing how the input should be used.
       */
      role?: string;

      /**
       * Provider-specific options for this input file.
       */
      providerOptions?: SharedV4ProviderOptions;
    }
  | {
      type: 'url';

      /**
       * URL of the input file.
       */
      url: string;

      /**
       * The IANA media type of the referenced file, when known.
       */
      mediaType?: string;

      /**
       * Original filename, when available.
       */
      filename?: string;

      /**
       * Provider-independent hint describing how the input should be used.
       */
      role?: string;

      /**
       * Provider-specific options for this input file.
       */
      providerOptions?: SharedV4ProviderOptions;
    };
