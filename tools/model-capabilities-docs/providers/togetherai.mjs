export const togetheraiDocs = {
  catalogPath: 'packages/togetherai/src/togetherai-model-catalog.ts',
  catalogExport: 'togetheraiModelCatalog',
  providerOptionsExport: 'togetherAIProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/24-togetherai.mdx',
  tables: [
    {
      id: 'togetherai-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'togetherai-image-editing',
      capability: 'image',
      filter: entry => entry.capabilities.image?.editingDescription != null,
      columns: [['Description', 'editingDescription', String]],
    },
    {
      id: 'togetherai-image',
      capability: 'image',
      columns: [
        [
          'Sizes',
          'sizes',
          v => (Array.isArray(v) ? v.join(', ') : v.description),
        ],
        ['Image Editing', 'fileInput'],
        ['Mask Input', 'maskInput'],
        ['Max Images Per Call', 'maxImagesPerCall', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'togetherai-embedding',
      capability: 'embedding',
      columns: [
        ['Dimensions', 'defaultDimensions', String],
        ['Max Tokens', 'maxTokens', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'togetherai-reranking',
      capability: 'reranking',
      columns: [
        ['Text Documents', 'documents.text'],
        ['Object Documents', 'documents.object'],
        ['Top N', 'topN'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'togetherai-provider-options' }],
};
