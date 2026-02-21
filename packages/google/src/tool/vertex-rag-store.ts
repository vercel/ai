import { createProviderToolFactory } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/use-vertexai-search#generate-content-using-gemini-api
// https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/rag-output-explained

/**
 * A tool that enables the model to perform RAG searches against a Vertex RAG Store.
 *
 * @note Only works with Vertex Gemini models.
 */
export const vertexRagStore = createProviderToolFactory<
  {},
  {
    /**
     * RagCorpus resource name, eg: projects/{project}/locations/{location}/ragCorpora/{rag_corpus}
     */
    ragCorpus: string;

    /**
     * File IDs within the corpus to search. When specified, only these files
     * are searched instead of the entire corpus. For large-scale filtering,
     * prefer using `metadataFilter` instead.
     */
    ragFileIds?: string[];

    /**
     * The number of top contexts to retrieve.
     */
    topK?: number;

    /**
     * Filter expression for metadata. Use this to filter results by tags/metadata
     * assigned to files when they were uploaded.
     * @example 'user_id = "user-123" AND project = "acme"'
     */
    metadataFilter?: string;

    /**
     * Only return results with vector similarity larger than this threshold.
     * Value should be between 0 and 1.
     */
    vectorSimilarityThreshold?: number;

    /**
     * Only return results with vector distance smaller than this threshold.
     */
    vectorDistanceThreshold?: number;
  }
>({
  id: 'google.vertex_rag_store',
  inputSchema: z.object({
    ragCorpus: z.string(),
    ragFileIds: z.array(z.string()).optional(),
    topK: z.number().optional(),
    metadataFilter: z.string().optional(),
    vectorSimilarityThreshold: z.number().optional(),
    vectorDistanceThreshold: z.number().optional(),
  }),
});
