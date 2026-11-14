export const fireworksDocs = {
  catalogPath: 'packages/fireworks/src/fireworks-model-catalog.ts',
  catalogExport: 'fireworksModelCatalog',
  providerOptionsExport: 'fireworksProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/26-fireworks.mdx',
  tables: [
    {
      id: 'fireworks-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'fireworks-embedding',
      capability: 'embedding',
      columns: [
        ['Dimensions', 'defaultDimensions', String],
        ['Max Tokens', 'maxTokens', String],
      ],
    },
    {
      id: 'fireworks-image',
      capability: 'image',
      columns: [
        [
          'Dimensions Specification',
          'size',
          v => (v ? 'Size' : 'Aspect Ratio'),
        ],
        ['Image Editing', 'fileInput'],
      ],
    },
    {
      id: 'fireworks-stability',
      catalogExport: 'fireworksStabilityModelCatalog',
      capability: 'image',
      columns: [],
    },
  ],
  providerOptionTables: [{ id: 'fireworks-provider-options' }],
};
