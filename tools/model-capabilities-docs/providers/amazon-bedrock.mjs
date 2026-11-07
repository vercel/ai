export const amazonBedrockDocs = {
  catalogPath: 'packages/amazon-bedrock/src/amazon-bedrock-model-catalog.ts',
  catalogExport: 'amazonBedrockModelCatalog',
  providerOptionsExport: 'amazonBedrockProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/08-amazon-bedrock.mdx',
  tables: [
    {
      id: 'amazon-bedrock-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'amazon-bedrock-embedding',
      capability: 'embedding',
      columns: [
        ['Default Dimensions', 'defaultDimensions', String],
        ['Custom Dimensions', 'customDimensions'],
      ],
    },
    {
      id: 'amazon-bedrock-reranking',
      capability: 'reranking',
      columns: [
        ['Text Documents', 'documents.text'],
        ['Object Documents', 'documents.object'],
        ['Top N', 'topN'],
      ],
    },
    {
      id: 'amazon-bedrock-image',
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
      id: 'amazon-bedrock-anthropic',
      catalogExport: 'amazonBedrockAnthropicModelCatalog',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Computer Use', 'tools.computerUse'],
        ['Reasoning', 'reasoning.support'],
      ],
    },
    {
      id: 'amazon-bedrock-mantle',
      catalogExport: 'amazonBedrockMantleModelCatalog',
      capability: 'language',
      columns: [
        ['Chat Completions', 'endpoints.chatCompletions'],
        ['Responses API', 'endpoints.responses'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'amazon-bedrock-provider-options' }],
};
