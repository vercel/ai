import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
  AgenticRetrieveStreamCommand,
} from '@aws-sdk/client-bedrock-agent-runtime';

export interface BedrockKBRetrieverOptions {
  /** The ID of the Bedrock Knowledge Base. */
  knowledgeBaseId: string;
  /** AWS region. Defaults to AWS_REGION env var or us-east-1. */
  region?: string;
  /** Maximum number of results. Defaults to 5. */
  numberOfResults?: number;

  /** If true, try AgenticRetrieveStream first with fallback to plain Retrieve. Defaults to USE_AGENTIC_RETRIEVAL env var or true. */
  useAgenticRetrieval?: boolean;
  /** If true, generate a cited answer in addition to retrieval results. Defaults to false. */
  generateResponse?: boolean;
}

export interface RetrievalResult {
  content: string;
  source: string;
  score: number;
}

export interface RetrievalResponse {
  results: RetrievalResult[];
  /** Present when generateResponse is true and agentic retrieval succeeds. */
  generatedResponse?: {
    answer: string;
    citations: any[];
  };
}

function getSourceUri(result: any): string {
  if (result == null) return '';
  const location = result.location ?? {};
  if (location.s3Location) return location.s3Location.uri ?? '';
  if (location.webLocation) return location.webLocation.url ?? '';
  if (location.confluenceLocation) return location.confluenceLocation.url ?? '';
  if (location.salesforceLocation) return location.salesforceLocation.url ?? '';
  if (location.sharePointLocation) return location.sharePointLocation.url ?? '';
  if (location.customDocumentLocation) return location.customDocumentLocation.id ?? '';
  // Fallback for agentic results
  return result.metadata?._source_uri ?? '';
}

export function bedrockKnowledgeBaseRetriever(options: BedrockKBRetrieverOptions) {
  const {
    knowledgeBaseId,
    region = process.env.AWS_REGION ?? 'us-east-1',
    numberOfResults = 5,
    useAgenticRetrieval = process.env.USE_AGENTIC_RETRIEVAL !== 'false',
    generateResponse = false,
  } = options;

  const client = new BedrockAgentRuntimeClient({ region, customUserAgent: [['vercel-ai', 'bedrock-kb']] });

  return {
    /**
     * Retrieve relevant documents from the knowledge base.
     */
    async retrieve(query: string): Promise<RetrievalResponse> {
      // Try agentic retrieval first
      if (useAgenticRetrieval) {
        try {
          const agenticCmd = new AgenticRetrieveStreamCommand({
            knowledgeBaseId,
            messages: [{ content: { text: query }, role: 'user' }],
            retrievers: [{
              configuration: {
                knowledgeBase: {
                  knowledgeBaseId,
                  retrievalOverrides: { maxNumberOfResults: numberOfResults },
                },
              },
            }],
            agenticRetrieveConfiguration: {
              foundationModelType: 'MANAGED',
              rerankingModelType: 'MANAGED',
            },
            generateResponse,
          } as any);

          const response = await client.send(agenticCmd);
          const results: RetrievalResult[] = [];
          let generatedAnswer = '';
          let citations: any[] = [];
          const stream = (response as any).result?.stream;
          if (stream) {
            for await (const event of stream) {
              if (event.retrievalResult) {
                results.push({
                  content: event.retrievalResult.content?.text ?? '',
                  source: getSourceUri(event.retrievalResult),
                  score: event.retrievalResult.score ?? 0,
                });
              }
              if (event.result?.generatedResponse) {
                generatedAnswer += event.result.generatedResponse.answer ?? '';
                citations.push(...(event.result.generatedResponse.citations ?? []));
              }
            }
          }
          if (results.length > 0) {
            return {
              results,
              ...(generateResponse && generatedAnswer
                ? { generatedResponse: { answer: generatedAnswer, citations } }
                : {}),
            };
          }
        } catch {
          // Fall through to plain retrieve
        }
      }

      // Fallback to managed retrieve
      const retrievalConfiguration = { managedSearchConfiguration: { numberOfResults } };

      const command = new RetrieveCommand({
        knowledgeBaseId,
        retrievalQuery: { text: query },
        retrievalConfiguration,
      });

      const response = await client.send(command);
      const results: RetrievalResult[] = [];

      for (const result of response.retrievalResults ?? []) {
        results.push({
          content: result.content?.text ?? '',
          source: getSourceUri(result),
          score: result.score ?? 0,
        });
      }

      return { results };
    },
  };
}
