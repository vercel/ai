import {
  createProviderExecutedToolFactory,
  lazySchema,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

type GoogleVertexAISearchCommonArgs = {
  /** Maximum number of retrieval results to return. Vertex AI supports up to 10. */
  maxResults?: number;

  /** Filter expression applied to the retrieved documents. */
  filter?: string;
};

export type GoogleVertexAISearchToolArgs = GoogleVertexAISearchCommonArgs &
  (
    | {
        /** Fully-qualified Vertex AI Search data store resource name. */
        datastore: string;
        engine?: never;
        dataStoreSpecs?: never;
      }
    | {
        /** Fully-qualified Vertex AI Search engine resource name. */
        engine: string;
        datastore?: never;

        /** Per-data-store configuration for an engine. */
        dataStoreSpecs?: Array<{
          dataStore: string;
          filter?: string;
        }>;
      }
  );

/**
 * A tool that grounds model responses with Vertex AI Search.
 *
 * @note Only works with Vertex Gemini models.
 */
export const vertexAiSearch = createProviderExecutedToolFactory<
  {},
  {},
  GoogleVertexAISearchToolArgs
>({
  id: 'google.vertex_ai_search',
  inputSchema: lazySchema(() => zodSchema(z.object({}))),
  outputSchema: lazySchema(() => zodSchema(z.object({}))),
});
