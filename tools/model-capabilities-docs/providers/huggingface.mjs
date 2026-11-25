export const huggingfaceDocs = {
  catalogPath: 'packages/huggingface/src/huggingface-model-catalog.ts',
  catalogExport: 'huggingFaceModelCatalog',
  providerOptionsExport: 'huggingFaceProviderOptions',
  docsPath: 'content/providers/01-ai-sdk-providers/170-huggingface.mdx',
  tables: [
    {
      id: 'huggingface-language',
      capability: 'language',
      columns: [
        ['Image Input', 'inputs.image'],
        ['Object Generation', 'objectGeneration'],
        ['Tool Usage', 'tools.usage'],
        ['Tool Streaming', 'tools.streaming'],
      ],
    },
  ],
  providerOptionTables: [{ id: 'huggingface-provider-options' }],
};
