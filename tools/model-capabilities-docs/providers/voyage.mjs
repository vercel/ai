export const voyageDocs = {
  catalogPath: 'packages/voyage/src/voyage-model-catalog.ts',
  catalogExport: 'voyageModelCatalog',
  providerOptionsExport: 'voyageProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/27-voyage.mdx',
  tables: [
    {
      id: 'voyage-embedding',
      capability: 'embedding',
      columns: [
        ['Default Dimensions', 'defaultDimensions', String],
        ['Context Length', 'maxTokens', v => v.toLocaleString('en-US')],
        ['Custom Dimensions', 'customDimensions'],
        ['Max Values per Call', 'maxEmbeddingsPerCall', String],
      ],
    },
    {
      id: 'voyage-reranking',
      capability: 'reranking',
      columns: [
        [
          'Context Length',
          'maxTokens',
          v => v?.toLocaleString('en-US') ?? 'Not declared',
        ],
        ['Text Documents', 'documents.text'],
        ['Object Documents', 'documents.object'],
        ['Top N', 'topN'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'voyage-provider-options' }],
};
