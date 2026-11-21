export const deepinfraDocs = {
  catalogPath: 'packages/deepinfra/src/deepinfra-model-catalog.ts',
  catalogExport: 'deepInfraModelCatalog',
  providerOptionsExport: 'deepInfraProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/11-deepinfra.mdx',
  tables: [
    {
      id: 'deepinfra-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'deepinfra-image',
      capability: 'image',
      columns: [
        [
          'Dimensions Specification',
          'dimensionSpecification',
          v => v ?? 'Not declared',
        ],
        ['Notes', 'notes', v => v ?? 'Not declared'],
        ['Image Editing', 'fileInput'],
        ['Mask Input', 'maskInput'],
        ['Max Images Per Call', 'maxImagesPerCall', v => v ?? 'Not declared'],
      ],
    },
    {
      id: 'deepinfra-embedding',
      capability: 'embedding',
      columns: [
        ['Dimensions', 'defaultDimensions', String],
        ['Max Tokens', 'maxTokens', v => v ?? 'Not declared'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'deepinfra-provider-options' }],
};
