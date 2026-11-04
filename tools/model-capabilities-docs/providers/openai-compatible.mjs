export const openaiCompatibleDocs = {
  catalogPath:
    'packages/openai-compatible/src/openai-compatible-model-catalog.ts',
  catalogExport: 'openaiCompatibleModelCatalog',
  providerOptionsExport: 'openaiCompatibleProviderOptions',
  docsPath: 'content/providers/04-openai-compatible-providers/index.mdx',
  tables: [
    {
      id: 'openai-compatible-language',
      capability: 'language',
      formatModelId: () => 'configured model',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
    {
      id: 'openai-compatible-image',
      capability: 'image',
      formatModelId: () => 'configured model',
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
  ],
  providerOptionTables: [{ id: 'openai-compatible-provider-options' }],
};
