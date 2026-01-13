import { formatLLM, type VectorStoreIndex } from '@vectorstores/core';
import type { EmbeddingModel, Tool } from 'ai';
import { embedMany, tool } from 'ai';
import { z } from 'zod';

/**
 * Options for the vectorstores tool.
 */
export interface VectorstoresToolOptions {
  /**
   * The VectorStoreIndex to query.
   */
  index: VectorStoreIndex;

  /**
   * Optional custom description for the tool.
   * @default "get information from your knowledge base to answer questions."
   */
  description?: string;

  /**
   * The number of top results to retrieve.
   * @default 10
   */
  similarityTopK?: number;
}

/**
 * Creates a tool that queries a VectorStoreIndex for relevant documents.
 *
 * This tool can be used with AI SDK's `generateText` or `streamText` functions
 * to give the model access to your knowledge base.
 *
 * @example
 * ```ts
 * import { openai } from "@ai-sdk/openai";
 * import { VectorStoreIndex, Document } from "@vectorstores/core";
 * import { streamText } from "ai";
 * import { vectorstores, vercelEmbedding } from "@ai-sdk/vectorstores";
 *
 * const index = await VectorStoreIndex.fromDocuments([document], {
 *   embedFunc: vercelEmbedding(openai.embedding("text-embedding-3-small")),
 * });
 *
 * const result = streamText({
 *   model: openai("gpt-4o"),
 *   prompt: "What is the main topic?",
 *   tools: {
 *     queryKnowledge: vectorstores({ index }),
 *   },
 * });
 * ```
 */
export function vectorstores({
  index,
  description,
  similarityTopK = 10,
}: VectorstoresToolOptions): Tool<{ query: string }, string> {
  const retriever = index.asRetriever({ similarityTopK });

  return tool({
    description:
      description ??
      'get information from your knowledge base to answer questions.',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'The query to search for relevant documents in the knowledge base.',
        ),
    }),
    execute: async ({ query }) => {
      const nodes = await retriever.retrieve({ query });
      return formatLLM(nodes) || 'No relevant documents found.';
    },
  });
}

/**
 * Options for the vercelEmbedding adapter function.
 */
export interface VercelEmbeddingOptions {
  /**
   * Maximum number of retries for embedding requests.
   * @default 2
   */
  maxRetries?: number;

  /**
   * Additional headers to include in the request.
   */
  headers?: Record<string, string>;
}

/**
 * Creates an embedding function compatible with VectorStores from a Vercel AI SDK embedding model.
 *
 * This adapter allows you to use any AI SDK embedding model with VectorStores,
 * enabling easy integration between the two libraries.
 *
 * @param model - The AI SDK embedding model to use (e.g., openai.embedding("text-embedding-3-small"))
 * @param options - Optional configuration for the embedding function
 * @returns An async function that takes an array of strings and returns their embeddings
 *
 * @example
 * ```ts
 * import { openai } from "@ai-sdk/openai";
 * import { VectorStoreIndex, Document } from "@vectorstores/core";
 * import { vercelEmbedding } from "@ai-sdk/vectorstores";
 *
 * const index = await VectorStoreIndex.fromDocuments([document], {
 *   embedFunc: vercelEmbedding(openai.embedding("text-embedding-3-small")),
 * });
 * ```
 */
export function vercelEmbedding(
  model: EmbeddingModel,
  options: VercelEmbeddingOptions = {},
): (input: string[]) => Promise<number[][]> {
  const { maxRetries, headers } = options;

  return async (input: string[]): Promise<number[][]> => {
    const { embeddings } = await embedMany({
      model,
      values: input,
      maxRetries,
      headers,
    });
    return embeddings;
  };
}

/**
 * Re-export types for convenience.
 */
export type { EmbeddingModel, Tool };
